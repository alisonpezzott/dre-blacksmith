# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse": "1beff059-8511-4959-99b1-a272a637573e",
# META       "default_lakehouse_name": "lh_blacksmith",
# META       "default_lakehouse_workspace_id": "45307096-4208-4180-a75b-8846fc8f9e24",
# META       "known_lakehouses": [
# META         {
# META           "id": "1beff059-8511-4959-99b1-a272a637573e"
# META         }
# META       ]
# META     }
# META   }
# META }

# MARKDOWN ********************

# # nb_02_qualidade
# # Testes de qualidade das 8 tabelas do `lh_blacksmith`. Cada teste registra a falha sem interromper; a última célula falha (`assert`) com a lista completa e, se tudo passar, imprime `qualidade ok`.
# # Inclui os 5 testes da seção 6 do CLAUDE.md. O teste 3 (link folha por conta) vale só para contas de grupos com 2 ou mais contas: D&A, resultado financeiro e IR/CSLL são contas únicas no grupo e chegam ao Sankey pelos links de subtotal e de prejuízo do grupo.

# CELL ********************

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

calendario = spark.table("dim_calendario")
contas = spark.table("dim_conta")
regioes = spark.table("dim_regiao")
cenarios = spark.table("dim_cenario")
nos = spark.table("dim_no_sankey")
links = spark.table("dim_link_sankey")
lancamentos = spark.table("fato_lancamentos")
operacional = spark.table("fato_operacional")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

falhas: list[str] = []


def verificar(ok: bool, mensagem: str) -> None:
    """Registra a falha sem interromper: o assert final mostra todas de uma vez."""
    if not ok:
        falhas.append(mensagem)


def contar_orfaos(df: DataFrame, coluna_fato: str, dim: DataFrame, coluna_dim: str) -> int:
    """Conta as linhas de df cuja chave não existe na dimensão."""
    chaves = dim.select(F.col(coluna_dim).alias("_chave"))
    return df.join(chaves, F.col(coluna_fato) == F.col("_chave"), "left_anti").count()


def contar_duplicadas(df: DataFrame, chaves: list[str]) -> int:
    """Conta as combinações de chave que aparecem mais de uma vez."""
    return df.groupBy(*chaves).count().filter("count > 1").count()

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# 1. contagens, nulos nas chaves e unicidade das chaves e do grão das fatos
contagens_esperadas = {
    "dim_calendario": 36,
    "dim_conta": 19,
    "dim_regiao": 5,
    "dim_cenario": 2,
    "dim_no_sankey": 30,
    "dim_link_sankey": 33,
    "fato_lancamentos": 6484,
    "fato_operacional": 180,
}
chaves_por_tabela = {
    "dim_calendario": (calendario, ["data"]),
    "dim_conta": (contas, ["cod_conta"]),
    "dim_regiao": (regioes, ["cod_regiao"]),
    "dim_cenario": (cenarios, ["cod_cenario"]),
    "dim_no_sankey": (nos, ["cod_no"]),
    "dim_link_sankey": (links, ["cod_link"]),
    "fato_lancamentos": (lancamentos, ["data", "cod_regiao", "cod_conta", "cenario"]),
    "fato_operacional": (operacional, ["data", "cod_regiao"]),
}
for nome, (df, chaves) in chaves_por_tabela.items():
    quantidade = df.count()
    verificar(
        quantidade == contagens_esperadas[nome],
        f"{nome}: {quantidade} linhas, esperado {contagens_esperadas[nome]}",
    )
    for coluna in chaves:
        verificar(df.filter(F.col(coluna).isNull()).count() == 0, f"nulo em {nome}.{coluna}")
    verificar(contar_duplicadas(df, chaves) == 0, f"chave duplicada em {nome} ({', '.join(chaves)})")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# 2. integridade referencial (as relações do modelo semântico e as do sankey)
relacoes = [
    (lancamentos, "fato_lancamentos", "cod_conta", contas, "cod_conta"),
    (lancamentos, "fato_lancamentos", "cod_regiao", regioes, "cod_regiao"),
    (lancamentos, "fato_lancamentos", "cenario", cenarios, "cod_cenario"),
    (lancamentos, "fato_lancamentos", "data", calendario, "data"),
    (operacional, "fato_operacional", "data", calendario, "data"),
    (operacional, "fato_operacional", "cod_regiao", regioes, "cod_regiao"),
    (links, "dim_link_sankey", "cod_no_origem", nos, "cod_no"),
    (links, "dim_link_sankey", "cod_no_destino", nos, "cod_no"),
    (links.filter("cod_conta <> ''"), "dim_link_sankey", "cod_conta", contas, "cod_conta"),
]
for df, nome, coluna, dim, coluna_dim in relacoes:
    orfaos = contar_orfaos(df, coluna, dim, coluna_dim)
    verificar(orfaos == 0, f"{orfaos} órfãos em {nome}.{coluna}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# 3. ordenação do modelo: cada rótulo precisa de um único valor na coluna de ordenação (sortByColumn)
ordenacoes = [
    (calendario, "dim_calendario", "mes_ano", "indice_mes"),
    (calendario, "dim_calendario", "nome_mes", "mes"),
    (contas, "dim_conta", "nome_conta", "ordem_dre"),
    (cenarios, "dim_cenario", "nome_cenario", "ordem_cenario"),
]
for df, nome, rotulo, ordem in ordenacoes:
    ambiguos = (
        df.groupBy(rotulo).agg(F.countDistinct(ordem).alias("qtd")).filter("qtd > 1").count()
    )
    verificar(ambiguos == 0, f"{nome}.{rotulo}: {ambiguos} rótulos com mais de um {ordem}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# 4. regras de sinal: valor sempre positivo; valor_dre positivo na receita e negativo na despesa
verificar(lancamentos.filter("valor < 0").count() == 0, "fato_lancamentos.valor negativo")
verificar(
    contas.filter(~F.col("natureza").isin("receita", "despesa")).count() == 0,
    "dim_conta.natureza fora de receita/despesa",
)
sinal_incoerente = (
    lancamentos.join(contas.select("cod_conta", "natureza"), "cod_conta")
    .filter(
        ((F.col("natureza") == "receita") & (F.col("valor_dre") != F.col("valor")))
        | ((F.col("natureza") == "despesa") & (F.col("valor_dre") != -F.col("valor")))
    )
    .count()
)
verificar(sinal_incoerente == 0, f"{sinal_incoerente} linhas com valor_dre incoerente com dim_conta.natureza")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# 5. estrutura do sankey
# contas únicas no grupo (D&A, resultado financeiro, IR/CSLL) não têm link folha: o nó do grupo é
# o terminal do sankey, alimentado pelos links de subtotal e de prejuízo calculados por sankey_valor
contas_por_grupo = contas.groupBy("cod_grupo").agg(F.count("*").alias("qtd_contas"))
sem_link_folha = [
    linha.cod_conta
    for linha in contas.join(contas_por_grupo.filter("qtd_contas > 1"), "cod_grupo")
    .join(links.filter("cod_conta <> ''"), "cod_conta", "left_anti")
    .select("cod_conta")
    .collect()
]
verificar(not sem_link_folha, f"contas sem link folha no sankey: {sem_link_folha}")

verificar(
    links.filter(F.col("cod_link") != F.concat_ws("__", "cod_no_origem", "cod_no_destino")).count() == 0,
    "cod_link diferente de cod_no_origem__cod_no_destino",
)
verificar(
    links.filter(~F.col("tipo_link").isin("conta", "subtotal", "prejuizo")).count() == 0,
    "dim_link_sankey.tipo_link inválido",
)
verificar(
    links.filter((F.col("tipo_link") == "conta") != (F.col("cod_conta") != "")).count() == 0,
    "tipo_link = 'conta' não coincide com cod_conta preenchido",
)
verificar(
    nos.filter(~F.col("tipo_no").isin("receita", "total", "custo", "lucro", "prejuizo")).count() == 0,
    "dim_no_sankey.tipo_no inválido",
)

nos_em_links = links.select(F.col("cod_no_origem").alias("cod_no")).union(
    links.select(F.col("cod_no_destino").alias("cod_no"))
)
nos_soltos = [linha.cod_no for linha in nos.join(nos_em_links, "cod_no", "left_anti").collect()]
verificar(not nos_soltos, f"nós sem nenhum link: {nos_soltos}")

# fora os links de prejuízo (posicionados pelo app), todo link avança de coluna no sankey
colunas = nos.select("cod_no", "coluna_sankey")
regressivos = (
    links.filter("tipo_link <> 'prejuizo'")
    .join(colunas.toDF("cod_no_origem", "coluna_origem"), "cod_no_origem")
    .join(colunas.toDF("cod_no_destino", "coluna_destino"), "cod_no_destino")
    .filter("coluna_destino <= coluna_origem")
    .count()
)
verificar(regressivos == 0, f"{regressivos} links que não avançam de coluna no sankey")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# 6. totais de referência (realizado) e meses com prejuízo
lucro_liquido_esperado = {2024: 15882255.48, 2025: 13088163.15, 2026: 24560318.22}
lucro_liquido_ano = {
    linha.ano: float(linha.lucro_liquido)
    for linha in lancamentos.filter("cenario = 'realizado'")
    .groupBy(F.year("data").alias("ano"))
    .agg(F.sum("valor_dre").alias("lucro_liquido"))
    .collect()
}
for ano, esperado in lucro_liquido_esperado.items():
    obtido = lucro_liquido_ano.get(ano)
    verificar(
        obtido is not None and abs(obtido - esperado) < 1,
        f"lucro líquido realizado {ano}: obtido {obtido}, esperado {esperado}",
    )


def meses_com_prejuizo(cenario: str) -> list[str]:
    """Meses em que o lucro líquido consolidado do cenário é negativo."""
    return [
        str(linha.data)
        for linha in lancamentos.filter(F.col("cenario") == cenario)
        .groupBy("data")
        .agg(F.sum("valor_dre").alias("lucro_liquido"))
        .filter("lucro_liquido < 0")
        .orderBy("data")
        .collect()
    ]


prejuizo_realizado = meses_com_prejuizo("realizado")
verificar(
    prejuizo_realizado == ["2025-03-01", "2025-04-01"],
    f"meses com prejuízo no realizado: {prejuizo_realizado}",
)
prejuizo_orcado = meses_com_prejuizo("orcado")
verificar(not prejuizo_orcado, f"o orçado não previa prejuízo, mas tem: {prejuizo_orcado}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# 7. faixas do operacional
verificar(
    operacional.filter((F.col("churn_pct") < 0) | (F.col("churn_pct") > 1)).count() == 0,
    "fato_operacional.churn_pct fora de [0, 1]",
)
verificar(
    operacional.filter((F.col("nps") < -100) | (F.col("nps") > 100)).count() == 0,
    "fato_operacional.nps fora de [-100, 100]",
)
contagens_negativas = operacional.filter(
    (F.col("clientes_ativos") < 0)
    | (F.col("novos_clientes") < 0)
    | (F.col("headcount") < 0)
    | (F.col("contratos_fechados") < 0)
).count()
verificar(contagens_negativas == 0, f"{contagens_negativas} linhas do operacional com contagem negativa")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

for falha in falhas:
    print(f"FALHA: {falha}")
assert not falhas, f"{len(falhas)} teste(s) de qualidade falharam: " + " | ".join(falhas)
print("qualidade ok")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
