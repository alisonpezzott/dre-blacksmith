# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse": "{{ID_LAKEHOUSE}}",
# META       "default_lakehouse_name": "lh_blacksmith",
# META       "default_lakehouse_workspace_id": "{{ID_WORKSPACE}}",
# META       "known_lakehouses": [
# META         {
# META           "id": "{{ID_LAKEHOUSE}}"
# META         }
# META       ]
# META     }
# META   }
# META }

# MARKDOWN ********************

# # nb_01_ingestao
#
# Lê os 7 CSVs de `Files/Raw/blacksmith/` com schema explícito e grava as 8 tabelas Delta do `lh_blacksmith` (os 7 CSVs + `dim_cenario`).
#
# - A leitura falha (`FAILFAST`) em vez de gravar nulo quando um valor não converte, e confere os nomes do cabeçalho contra o schema (`enforceSchema = false`).
# - Recarga completa e idempotente (`overwrite`): a base é pequena, fictícia e totalmente derivável dos CSVs.
# - A última célula relê as tabelas e confere as contagens do dicionário de dados (seção 5.2 do CLAUDE.md).

# PARAMETERS CELL ********************

caminho_raw = "Files/Raw/blacksmith"

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from datetime import datetime
from zoneinfo import ZoneInfo

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

# V-Order vem desligado em workspaces novos; as tabelas são lidas pelo modelo em Direct Lake
spark.conf.set("spark.sql.parquet.vorder.default", "true")
# timestamps sem conversão de fuso: data_hora_carga já é gravada no horário de Brasília
spark.conf.set("spark.sql.session.timeZone", "UTC")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# schema de cada CSV, na ordem do cabeçalho do arquivo
schemas = {
    "dim_calendario": (
        "data DATE, ano INT, mes INT, nome_mes STRING, ano_mes STRING, mes_ano STRING, "
        "trimestre STRING, ano_trimestre STRING, semestre STRING"
    ),
    "dim_conta": (
        "cod_conta STRING, nome_conta STRING, cod_grupo STRING, nome_grupo STRING, "
        "natureza STRING, ordem_dre INT"
    ),
    "dim_regiao": "cod_regiao STRING, nome_regiao STRING, ufs STRING, escritorio STRING",
    "dim_no_sankey": (
        "cod_no STRING, nome_no STRING, tipo_no STRING, coluna_sankey INT, cor_hex STRING"
    ),
    "dim_link_sankey": (
        "cod_link STRING, cod_no_origem STRING, cod_no_destino STRING, etapa INT, "
        "cod_conta STRING, ordem_link INT, tipo_link STRING"
    ),
    "fato_lancamentos": (
        "data DATE, cod_regiao STRING, cod_conta STRING, cenario STRING, "
        "valor DECIMAL(18,2), valor_dre DECIMAL(18,2)"
    ),
    "fato_operacional": (
        "data DATE, cod_regiao STRING, clientes_ativos INT, novos_clientes INT, "
        "churn_pct DOUBLE, headcount INT, nps INT, contratos_fechados INT"
    ),
}

# contagens do dicionário de dados (seção 5.2 do CLAUDE.md)
contagens_esperadas = {
    "dim_calendario": 36,
    "dim_conta": 19,
    "dim_regiao": 5,
    "dim_no_sankey": 30,
    "dim_link_sankey": 33,
    "fato_lancamentos": 6484,
    "fato_operacional": 180,
    "dim_cenario": 2,
}

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

def ler_csv(tabela: str) -> DataFrame:
    """Lê o CSV com schema explícito e tira os espaços das bordas das colunas de texto."""
    df = (
        spark.read.format("csv")
        .option("header", True)
        .option("encoding", "UTF-8")
        .option("mode", "FAILFAST")  # valor que não converte derruba a leitura em vez de virar nulo
        .option("enforceSchema", False)  # confere os nomes do cabeçalho contra o schema
        .schema(schemas[tabela])
        .load(f"{caminho_raw}/{tabela}.csv")
    )
    return df.select(
        [F.trim(F.col(c)).alias(c) if tipo == "string" else F.col(c) for c, tipo in df.dtypes]
    )


def gravar(df: DataFrame, tabela: str) -> None:
    """Grava a tabela Delta no lakehouse padrão, substituindo dados e schema."""
    # recarga completa e idempotente: base pequena, fictícia e totalmente derivável dos CSVs
    df.write.format("delta").mode("overwrite").option("overwriteSchema", True).saveAsTable(tabela)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

tabelas = {tabela: ler_csv(tabela) for tabela in schemas}

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# timestamp único da carga, no horário de Brasília (vira data_ultima_carga no modelo)
momento_carga = datetime.now(ZoneInfo("America/Sao_Paulo")).replace(tzinfo=None)

# links de subtotal e de prejuízo não têm conta: vazio em vez de nulo (a medida sankey_valor compara com "")
tabelas["dim_link_sankey"] = tabelas["dim_link_sankey"].fillna({"cod_conta": ""})

# índice sequencial 1..36: base das comparações com o ano anterior e dos acumulados (calendário mensal)
tabelas["dim_calendario"] = tabelas["dim_calendario"].withColumn(
    "indice_mes", (F.col("ano") - 2024) * 12 + F.col("mes")
)

tabelas["fato_lancamentos"] = tabelas["fato_lancamentos"].withColumn(
    "data_hora_carga", F.lit(momento_carga)
)

tabelas["dim_cenario"] = spark.createDataFrame(
    [("realizado", "Realizado", 1), ("orcado", "Orçado", 2)],
    "cod_cenario STRING, nome_cenario STRING, ordem_cenario INT",
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

for tabela, df in tabelas.items():
    gravar(df, tabela)
    print(f"{tabela}: gravada")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# relê as tabelas Delta gravadas e confere as contagens do dicionário de dados
contagens = {tabela: spark.table(tabela).count() for tabela in contagens_esperadas}
for tabela, quantidade in contagens.items():
    print(f"{tabela}: {quantidade} linhas")

divergencias = {
    tabela: {"obtido": quantidade, "esperado": contagens_esperadas[tabela]}
    for tabela, quantidade in contagens.items()
    if quantidade != contagens_esperadas[tabela]
}
assert not divergencias, f"contagens divergentes: {divergencias}"
print("ingestao ok")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
