# CLAUDE.md — Blacksmith | DRE em Sankey no Microsoft Fabric

> Instruções do projeto para o Claude (Claude Code) executar a implantação de ponta a ponta:
> ingestão → tratamento → modelo semântico → medidas DAX → Fabric App (tema dark high‑tech).
> Leia este arquivo inteiro antes de executar qualquer fase. Execute uma fase por vez e valide antes de avançar.

---

## 1. Contexto

- **Empresa (fictícia):** Blacksmith — tecnologia (hardware, software, cloud e serviços), atuação nas 5 regiões do Brasil.
- **Objetivo:** um Fabric App que mostre, em um gráfico de **Sankey**, como a receita da Blacksmith se transforma em lucro (estilo dos gráficos de resultado de Apple/IBM), com KPIs, tendência, comparação realizado × orçado, visão por região e indicadores operacionais.
- **Dados:** 100% sintéticos (seed 42), 36 meses (jan/2024 a dez/2026), cenários `realizado` e `orcado`, valores em R$.
- **Evento de prejuízo (gancho da demo):** recall de hardware + multa contratual lançados em `opx_nao_recorrentes` (só no realizado; o orçado não previa):
  - mar/2025: R$ 4,8 mi → a Blacksmith fecha o mês com **prejuízo de R$ 2,59 mi** (o EBITDA zera);
  - abr/2025: R$ 2,6 mi → **prejuízo de R$ 0,61 mi** (só o Sudeste fica negativo; as outras regiões lucram);
  - 70% do evento no Sudeste; o ano de 2025 continua lucrativo (R$ 13,09 mi).
- **Arquivos de origem:** `base_sankey_dre_blacksmith_csv.zip` (7 CSVs) e `base_sankey_dre_blacksmith.xlsx` (mesmas tabelas + aba `dre_anual` de conferência).

### Números de referência (realizado, consolidado) — usar para validar cada fase

| métrica | 2024 | 2025 | 2026 |
|---|---|---|---|
| receita_bruta | 153.265.935,72 | 175.027.678,18 | 198.798.380,44 |
| receita_liquida | 135.461.230,60 | 154.819.681,80 | 175.717.045,70 |
| lucro_bruto | 75.880.220,52 | 88.283.003,38 | 103.402.997,28 |
| ebitda | 28.577.873,76 | 26.606.624,76 | 42.330.126,46 |
| lucro_liquido | 15.882.255,48 | 13.088.163,15 | 24.560.318,22 |
| margem_liquida | 11,7% | 8,5% | 14,0% |

Os valores exatos (anual, mês a mês, Sankey e regiões, nos dois cenários) estão em `validacao/referencias.json`, gerado a partir de `dataset/` por `uv run validacao/gerar_referencias.py` (substitui as abas `dre_anual` e `resultado_mensal` do Excel). Diferença tolerada: R$ 1,00.

### Cenários de teste do Sankey (realizado, todas as regiões)

| recorte | links que devem aparecer | valor |
|---|---|---|
| mar/2025 | `prejuizo_liquido → despesas_operacionais` | 2.071.798,75 |
| | `prejuizo_liquido → depreciacao_amortizacao` | 388.600,04 |
| | `prejuizo_liquido → resultado_financeiro_liquido` | 134.368,48 |
| | nós `ebitda`, `ebit_lucro_operacional`, `lair`, `lucro_liquido` | não aparecem (zero) |
| abr/2025 | `lucro_bruto → ebitda` | 20.950,98 |
| | `prejuizo_liquido → depreciacao_amortizacao` | 345.079,38 |
| | `prejuizo_liquido → resultado_financeiro_liquido` | 165.351,45 |
| | `prejuizo_liquido → ir_csll` | 101.830,17 |
| ano 2025 | `lair → lucro_liquido` | 13.088.163,15 (sem nó de prejuízo) |

---

## 2. Regras do projeto (obrigatórias)

1. **Idioma:** português do Brasil em tudo (tabelas, colunas, medidas, pastas, textos da UI, comentários de código).
2. **Nomenclatura:** `snake_case` em todos os identificadores: itens do workspace, tabelas, colunas, medidas, pastas de exibição, arquivos, variáveis, componentes e funções do app. Rótulos de exibição para o usuário final ficam nas colunas `nome_*` (com acentos).
3. **Prefixos:** `dim_` dimensões, `fato_` fatos, `nb_` notebooks, `sm_` modelo semântico, `lh_` lakehouse, `app_` app, `ws_` workspace.
4. **Segurança de dados:** nunca colar, versionar ou enviar dados reais de clientes em prompts, commits ou logs. Este projeto usa apenas dados fictícios. Se for adaptado para um cliente real, mascarar/anonimizar antes e seguir a política da Power Tuning.
5. **Sankey dinâmico:** o valor de cada link é sempre calculado pela medida `sankey_valor` sobre os valores já agregados do filtro. Nunca somar links pré‑calculados por mês ou região, porque um mês com prejuízo somado a meses com lucro (ou uma região negativa somada a regiões positivas) mostraria lucro e prejuízo ao mesmo tempo.
6. **Sem mock no app:** o app consome somente o modelo semântico. Se uma query falhar, mostrar estado de erro, nunca dados fictícios embutidos.
7. **Sem credenciais no código:** usar apenas a autenticação nativa do Fabric Apps (Rayfin).
8. **Validar antes de avançar:** cada fase tem um checklist de pronto. Não pule.

---

## 3. Arquitetura

```
CSVs (zip) ──► lh_blacksmith/Files/raw/blacksmith/
                 │  nb_01_ingestao
                 ▼
            tabelas delta (lh_blacksmith/Tables)
            dim_calendario, dim_conta, dim_regiao, dim_cenario,
            dim_no_sankey, dim_link_sankey, fato_lancamentos, fato_operacional
                 │  nb_02_qualidade (testes)
                 ▼
            sm_blacksmith_dre  (Direct Lake, medidas DAX)
                 │  Execute DAX Queries API
                 ▼
            app_blacksmith_dre (Fabric App, template dataapp, TypeScript)
```

| item | nome |
|---|---|
| workspace | `ws_blacksmith_financeiro` (capacidade Fabric) |
| lakehouse | `lh_blacksmith` |
| notebooks | `nb_01_ingestao`, `nb_02_qualidade` |
| modelo semântico | `sm_blacksmith_dre` |
| fabric app | `app_blacksmith_dre` |

---

## 4. Fase 0 — Pré‑requisitos

- [ ] Workspace em **capacidade Fabric** (Fabric Apps não funcionam em capacidade compartilhada/Pro).
- [ ] Permissão Contributor, Member ou Admin no workspace.
- [ ] Portal de administração do Fabric (tenant):
  - [ ] Workload **Fabric Apps** habilitado.
  - [ ] Configuração de integração **Semantic Model Execute Queries REST API** (pode aparecer como *Dataset Execute Queries REST API*) habilitada.
- [ ] Node.js 20 ou superior e npm na máquina de desenvolvimento.
- [ ] VS Code com o Claude Code.
- [ ] Usuários finais com permissões **Build** e **Read** no `sm_blacksmith_dre`.

> Fabric Apps está em preview. Antes de executar a Fase 4, confira a documentação atual em
> https://learn.microsoft.com/fabric/apps/ e rode `npx rayfin --help` para confirmar comandos e flags.

---

## 5. Fase 1 — Ingestão (`nb_01_ingestao`)

### 5.1 Upload
1. Criar o lakehouse `lh_blacksmith` (com schemas; tabelas em `dbo`).
2. Subir os 7 CSVs de `dataset/` para `Files/Raw/blacksmith/` (no ambiente atual a pasta foi criada com "R" maiúsculo; o parâmetro `caminho_raw` do `nb_01` acompanha, e o OneLake diferencia maiúsculas).

### 5.2 Dicionário de dados

| tabela | colunas (tipo) | grão |
|---|---|---|
| `dim_calendario` | data (date), ano (int), mes (int), nome_mes (string), ano_mes (string), mes_ano (string), trimestre (string), ano_trimestre (string), semestre (string) | 1 linha por mês |
| `dim_conta` | cod_conta, nome_conta, cod_grupo, nome_grupo, natureza (receita/despesa) (string), ordem_dre (int) | 19 contas |
| `dim_regiao` | cod_regiao, nome_regiao, ufs, escritorio (string) | 5 regiões |
| `dim_no_sankey` | cod_no, nome_no, tipo_no (receita/total/custo/lucro/prejuizo), cor_hex (string), coluna_sankey (int) | 30 nós |
| `dim_link_sankey` | cod_link, cod_no_origem, cod_no_destino, cod_conta, tipo_link (conta/subtotal/prejuizo) (string), etapa, ordem_link (int) | 33 links possíveis |
| `fato_lancamentos` | data (date), cod_regiao, cod_conta, cenario (string), valor, valor_dre (decimal(18,2)), data_hora_carga (timestamp, horário de Brasília, gerado no `nb_01`) | mês × região × conta × cenário (6.484 linhas; contas zeradas não têm linha) |
| `fato_operacional` | data (date), cod_regiao (string), clientes_ativos, novos_clientes, headcount, nps, contratos_fechados (int), churn_pct (double) | mês × região, só realizado (180 linhas) |

Regras de sinal: `valor` sempre positivo; `valor_dre` positivo para receita e negativo para despesa.

`dim_link_sankey` não tem valores: lista todos os links que podem existir. `cod_conta` preenchido = link folha (valor direto da conta); vazio = link de subtotal ou de prejuízo, calculado pela cascata da seção 7.3.

### 5.3 Código do notebook

Implementado em `fabric/nb_01_ingestao.Notebook/notebook-content.py` (formato Git do Fabric; importar com `fab import … --format .py`). Regras:

- Schema DDL explícito por tabela, **na ordem do cabeçalho do CSV** (a ordem de `dim_link_sankey` no arquivo difere da ordem do dicionário), com `mode=FAILFAST` (valor que não converte derruba a leitura em vez de virar nulo) e `enforceSchema=false` (confere os nomes do cabeçalho).
- `trim` das colunas de texto num único `select`; `dim_link_sankey.cod_conta` nulo vira `""`.
- V-Order ligado (`spark.sql.parquet.vorder.default`), porque as tabelas são lidas em Direct Lake.
- `dim_calendario.indice_mes = (ano − 2024) × 12 + mes`; `fato_lancamentos.data_hora_carga` = um único timestamp da carga (Brasília).
- Gravação Delta `overwrite` + `overwriteSchema` (recarga completa e idempotente de base pequena e derivável); `dim_cenario` criada no próprio notebook.
- A última célula relê as 8 tabelas e faz `assert` das contagens da seção 5.2.

`indice_mes` (1 a 36) é a chave das comparações com o ano anterior e dos acumulados, porque o calendário é mensal e não diário.

### Pronto quando
- [ ] 8 tabelas delta criadas (7 CSVs + `dim_cenario`), com as contagens da seção 5.2.
- [ ] Tipos corretos (sem `string` em colunas numéricas/data).

---

## 6. Fase 2 — Tratamento e qualidade (`nb_02_qualidade`)

Testes obrigatórios. O notebook deve **falhar** (`assert`) se algum não passar. Implementado em `fabric/nb_02_qualidade.Notebook/notebook-content.py`: cada teste registra a falha e a última célula faz um único `assert` com a lista completa; se tudo passar, imprime `qualidade ok`.

1. Contagens da seção 5.2; sem nulos nas chaves; chaves das dimensões e grão das duas fatos sem duplicidade.
2. Integridade referencial: as relações do modelo (seção 7.2), `data` das fatos → `dim_calendario`, e os nós e contas de `dim_link_sankey`.
3. **Link folha para toda conta de grupo com 2 ou mais contas.** D&A, resultado financeiro e IR/CSLL são contas únicas no grupo: o nó do grupo é o terminal do Sankey e é alimentado pelos links de subtotal e de prejuízo (a versão anterior deste teste exigia link folha para todas as contas e falhava nessas três).
4. Lucro líquido realizado 2024/2025/2026 com tolerância de R$ 1.
5. Meses com prejuízo consolidado: só 2025-03 e 2025-04 no realizado; nenhum no orçado.

Também verifica: ordenação (cada rótulo com um único valor de `sortByColumn`), regras de sinal (`valor ≥ 0`; `valor_dre` coerente com `dim_conta.natureza`), estrutura do Sankey (`cod_link = origem__destino`, `tipo_link`, nós sem link, links que não avançam de coluna) e faixas do operacional.

### Pronto quando
- [ ] `nb_02_qualidade` imprime `qualidade ok`.
- [ ] Lucro líquido realizado 2024 = 15.882.255,48 e 2025 = 13.088.163,15.
- [ ] Apenas mar/2025 e abr/2025 aparecem com prejuízo consolidado.
- [ ] Pipeline `pl_blacksmith_carga`: `nb_01_ingestao` → `nb_02_qualidade` → `nb_03_atualizar_modelo` (refresh do modelo com semantic link, só se a qualidade passar). Com "Keep your Direct Lake data up to date" desligado no modelo, o reenquadramento só acontece depois dos testes.

---

## 7. Fase 3 — Modelo semântico (`sm_blacksmith_dre`)

### 7.1 Criação
- Criar a partir do `lh_blacksmith` em modo **Direct Lake on OneLake** (expressão `AzureStorage.DataLake`), incluindo as 8 tabelas. É o tipo recomendado pela Microsoft para modelos novos e o que aceita a tabela calculada `_medidas`.
- Definição versionada em `fabric/sm_blacksmith_dre.SemanticModel/` (TMDL). Fluxo: `fab export` → editar o TMDL → `fab import -f` → refresh. A `culture` fica em `en-US`: o serviço não permite trocar o idioma de um modelo existente, e as format strings já são explícitas.
- Fatos com todas as colunas ocultas (expor somente medidas); nas dimensões, ocultar as chaves `cod_*` usadas em relacionamento, `cod_grupo` e `indice_mes`. `dim_no_sankey` e `dim_link_sankey` ficam visíveis (Plano B). `discourageImplicitMeasures` ligado.
- Ordenar colunas: `dim_calendario[mes_ano]` por `indice_mes`; `dim_calendario[nome_mes]` por `mes`; `dim_conta[nome_conta]` por `ordem_dre`; `dim_cenario[nome_cenario]` por `ordem_cenario`.

### 7.2 Relacionamentos (todos 1:N, filtro em direção única)

| de (1) | para (N) |
|---|---|
| `dim_calendario[data]` | `fato_lancamentos[data]`, `fato_operacional[data]` |
| `dim_regiao[cod_regiao]` | `fato_lancamentos[cod_regiao]`, `fato_operacional[cod_regiao]` |
| `dim_conta[cod_conta]` | `fato_lancamentos[cod_conta]` |
| `dim_cenario[cod_cenario]` | `fato_lancamentos[cenario]` |

`dim_no_sankey` e `dim_link_sankey` ficam **sem relacionamento**: a medida `sankey_valor` lê o link selecionado e calcula o valor a partir das medidas da DRE, que já respeitam os filtros de data, região e cenário.

### 7.3 Medidas DAX

Criar numa tabela de medidas `_medidas` (ou na `fato_lancamentos`), com as pastas de exibição indicadas. Todas as medidas da DRE respeitam o filtro de `dim_cenario`; as medidas `_realizado`/`_orcado` forçam o cenário.

**Pasta `01_dre`** — formato `"R$" #,##0;("R$" #,##0);-`

```dax
valor_dre = SUM ( fato_lancamentos[valor_dre] )

receita_bruta = CALCULATE ( [valor_dre], dim_conta[cod_grupo] = "receita_bruta" )
deducoes_receita = CALCULATE ( [valor_dre], dim_conta[cod_grupo] = "deducoes_da_receita" )
receita_liquida = [receita_bruta] + [deducoes_receita]
custos = CALCULATE ( [valor_dre], dim_conta[cod_grupo] = "custos_cpv_csp" )
lucro_bruto = [receita_liquida] + [custos]
despesas_operacionais = CALCULATE ( [valor_dre], dim_conta[cod_grupo] = "despesas_operacionais" )
ebitda = [lucro_bruto] + [despesas_operacionais]
depreciacao_amortizacao = CALCULATE ( [valor_dre], dim_conta[cod_grupo] = "depreciacao_amortizacao" )
ebit = [ebitda] + [depreciacao_amortizacao]
resultado_financeiro = CALCULATE ( [valor_dre], dim_conta[cod_grupo] = "resultado_financeiro" )
lair = [ebit] + [resultado_financeiro]
ir_csll = CALCULATE ( [valor_dre], dim_conta[cod_grupo] = "impostos_sobre_o_lucro" )
lucro_liquido = [lair] + [ir_csll]
```

**Pasta `02_margens`** — formato `0.0%`

```dax
margem_bruta = DIVIDE ( [lucro_bruto], [receita_liquida] )
margem_ebitda = DIVIDE ( [ebitda], [receita_liquida] )
margem_ebit = DIVIDE ( [ebit], [receita_liquida] )
margem_liquida = DIVIDE ( [lucro_liquido], [receita_liquida] )
peso_custos = DIVIDE ( - [custos], [receita_liquida] )
peso_despesas_operacionais = DIVIDE ( - [despesas_operacionais], [receita_liquida] )
aliquota_efetiva_ir = DIVIDE ( - [ir_csll], [lair] )
```

**Pasta `03_comparativos`**

```dax
receita_liquida_realizado = CALCULATE ( [receita_liquida], dim_cenario[cod_cenario] = "realizado" )
receita_liquida_orcado = CALCULATE ( [receita_liquida], dim_cenario[cod_cenario] = "orcado" )
var_receita_liquida_orcado_pct = DIVIDE ( [receita_liquida_realizado] - [receita_liquida_orcado], ABS ( [receita_liquida_orcado] ) )

lucro_liquido_realizado = CALCULATE ( [lucro_liquido], dim_cenario[cod_cenario] = "realizado" )
lucro_liquido_orcado = CALCULATE ( [lucro_liquido], dim_cenario[cod_cenario] = "orcado" )
var_lucro_liquido_orcado_pct = DIVIDE ( [lucro_liquido_realizado] - [lucro_liquido_orcado], ABS ( [lucro_liquido_orcado] ) )

-- ano anterior (calendário mensal: desloca 12 posições em indice_mes)
receita_liquida_aa =
VAR meses_aa = SELECTCOLUMNS ( VALUES ( dim_calendario[indice_mes] ), "indice_mes", dim_calendario[indice_mes] - 12 )
RETURN CALCULATE ( [receita_liquida], REMOVEFILTERS ( dim_calendario ), TREATAS ( meses_aa, dim_calendario[indice_mes] ) )
var_receita_liquida_aa_pct = DIVIDE ( [receita_liquida] - [receita_liquida_aa], ABS ( [receita_liquida_aa] ) )

lucro_liquido_aa =
VAR meses_aa = SELECTCOLUMNS ( VALUES ( dim_calendario[indice_mes] ), "indice_mes", dim_calendario[indice_mes] - 12 )
RETURN CALCULATE ( [lucro_liquido], REMOVEFILTERS ( dim_calendario ), TREATAS ( meses_aa, dim_calendario[indice_mes] ) )
var_lucro_liquido_aa_pct = DIVIDE ( [lucro_liquido] - [lucro_liquido_aa], ABS ( [lucro_liquido_aa] ) )

-- acumulado no ano até o último mês do contexto
receita_liquida_acumulada_ano =
VAR ultimo = MAX ( dim_calendario[indice_mes] )
VAR ano = MAX ( dim_calendario[ano] )
RETURN CALCULATE ( [receita_liquida], REMOVEFILTERS ( dim_calendario ),
                   dim_calendario[ano] = ano, dim_calendario[indice_mes] <= ultimo )

lucro_liquido_acumulado_ano =
VAR ultimo = MAX ( dim_calendario[indice_mes] )
VAR ano = MAX ( dim_calendario[ano] )
RETURN CALCULATE ( [lucro_liquido], REMOVEFILTERS ( dim_calendario ),
                   dim_calendario[ano] = ano, dim_calendario[indice_mes] <= ultimo )
```

As medidas de variação usam formato `+0.0%;-0.0%;0.0%`.

**Pasta `04_operacional`**

```dax
-- semiaditivas: saldo do último mês do contexto
clientes_ativos =
VAR ultimo = MAX ( dim_calendario[indice_mes] )
RETURN CALCULATE ( SUM ( fato_operacional[clientes_ativos] ), dim_calendario[indice_mes] = ultimo )

headcount =
VAR ultimo = MAX ( dim_calendario[indice_mes] )
RETURN CALCULATE ( SUM ( fato_operacional[headcount] ), dim_calendario[indice_mes] = ultimo )

novos_clientes = SUM ( fato_operacional[novos_clientes] )
contratos_fechados = SUM ( fato_operacional[contratos_fechados] )
churn_medio_pct = DIVIDE ( SUMX ( fato_operacional, fato_operacional[churn_pct] * fato_operacional[clientes_ativos] ), SUM ( fato_operacional[clientes_ativos] ) )
nps_medio = DIVIDE ( SUMX ( fato_operacional, fato_operacional[nps] * fato_operacional[clientes_ativos] ), SUM ( fato_operacional[clientes_ativos] ) )
receita_por_cliente = DIVIDE ( [receita_liquida_realizado], [clientes_ativos] )
receita_por_colaborador = DIVIDE ( [receita_liquida_realizado], [headcount] )
```

Formatos: inteiros `#,##0`; `churn_medio_pct` `0.00%`; `nps_medio` `0`; receitas por cliente/colaborador em R$.

**Pasta `05_sankey`** — formato R$

Lógica de prejuízo: a receita líquida vai "pagando" cada camada de gasto em cascata (custos → despesas operacionais → D&A → financeiro → IR). Enquanto há saldo, o que sobra vira o subtotal seguinte (lucro bruto, EBITDA…). Quando o saldo acaba, a parte não coberta de cada gasto passa a vir do nó `prejuizo_liquido`. A soma dos links que saem de `prejuizo_liquido` é exatamente o prejuízo líquido, e os subtotais zerados somem do gráfico.

```dax
sankey_valor =
VAR link  = SELECTEDVALUE ( dim_link_sankey[cod_link] )
VAR conta = SELECTEDVALUE ( dim_link_sankey[cod_conta] )
VAR valor_conta =
    IF ( conta <> "", CALCULATE ( SUM ( fato_lancamentos[valor] ), TREATAS ( { conta }, dim_conta[cod_conta] ) ) )
-- gastos de cada camada (positivos)
VAR g_custos = - [custos]
VAR g_opex   = - [despesas_operacionais]
VAR g_da     = - [depreciacao_amortizacao]
VAR g_fin    = - [resultado_financeiro]
VAR g_ir     = - [ir_csll]
-- saldo disponível após cada camada (nunca negativo)
VAR s0 = [receita_liquida]
VAR s1 = MAX ( s0 - g_custos, 0 )
VAR s2 = MAX ( s1 - g_opex, 0 )
VAR s3 = MAX ( s2 - g_da, 0 )
VAR s4 = MAX ( s3 - g_fin, 0 )
VAR s5 = MAX ( s4 - g_ir, 0 )
VAR resultado =
    SWITCH (
        link,
        "receita_bruta__deducoes_da_receita", - [deducoes_receita],
        "receita_bruta__receita_liquida", s0,
        "receita_liquida__custos_cpv_csp", MIN ( s0, g_custos ),
        "prejuizo_liquido__custos_cpv_csp", g_custos - MIN ( s0, g_custos ),
        "receita_liquida__lucro_bruto", s1,
        "lucro_bruto__despesas_operacionais", MIN ( s1, g_opex ),
        "prejuizo_liquido__despesas_operacionais", g_opex - MIN ( s1, g_opex ),
        "lucro_bruto__ebitda", s2,
        "ebitda__depreciacao_amortizacao", MIN ( s2, g_da ),
        "prejuizo_liquido__depreciacao_amortizacao", g_da - MIN ( s2, g_da ),
        "ebitda__ebit_lucro_operacional", s3,
        "ebit_lucro_operacional__resultado_financeiro_liquido", MIN ( s3, g_fin ),
        "prejuizo_liquido__resultado_financeiro_liquido", g_fin - MIN ( s3, g_fin ),
        "ebit_lucro_operacional__lair", s4,
        "lair__ir_csll", MIN ( s4, g_ir ),
        "prejuizo_liquido__ir_csll", g_ir - MIN ( s4, g_ir ),
        "lair__lucro_liquido", s5,
        valor_conta
    )
RETURN IF ( resultado > 0.005, resultado )

prejuizo_liquido = MAX ( - [lucro_liquido], 0 )   -- formato R$, para cartão/alerta

meses_com_prejuizo =
COUNTROWS ( FILTER ( VALUES ( dim_calendario[indice_mes] ), [lucro_liquido] < 0 ) )   -- formato #,##0
```

Validação no DAX Query View (mar/2025, realizado): todo nó com entrada e saída deve ter diferença zero.

```dax
EVALUATE
VAR l =
    CALCULATETABLE (
        ADDCOLUMNS ( dim_link_sankey, "v", [sankey_valor] ),
        dim_calendario[ano_mes] = "2025-03", dim_cenario[cod_cenario] = "realizado"
    )
VAR entra =
    SELECTCOLUMNS (
        GROUPBY ( l, dim_link_sankey[cod_no_destino], "entrada", SUMX ( CURRENTGROUP (), [v] ) ),
        "no", dim_link_sankey[cod_no_destino] & "", "entrada", [entrada]
    )
VAR sai =
    SELECTCOLUMNS (
        GROUPBY ( l, dim_link_sankey[cod_no_origem], "saida", SUMX ( CURRENTGROUP (), [v] ) ),
        "no", dim_link_sankey[cod_no_origem] & "", "saida", [saida]
    )
RETURN
    FILTER ( NATURALINNERJOIN ( entra, sai ), ABS ( [entrada] - [saida] ) > 0.05 )
-- esperado: nenhuma linha
```

**Medidas adicionais para a Fase 4** (o app só consome o modelo; definição completa em `fabric/sm_blacksmith_dre.SemanticModel/definition/tables/_medidas.tmdl`):

| pasta | medidas | formato |
|---|---|---|
| `03_comparativos` | `lucro_bruto_aa`, `ebitda_aa`, `margem_liquida_aa` | R$ / `0.0%` |
| `03_comparativos` | `var_lucro_bruto_aa_pct`, `var_ebitda_aa_pct` | `+0.0%;-0.0%;0.0%` |
| `03_comparativos` | `var_margem_liquida_aa_pp` (diferença em pontos percentuais) | `+0.0 p.p.` |
| `05_sankey` | `sankey_valor_aa`, `var_sankey_valor_aa_pct` (tooltip do Sankey) | R$ / `+0.0%` |
| `06_carga` | `data_ultima_carga` (máximo de `data_hora_carga`, sem filtros) | `dd/MM/yyyy HH:mm` |

**Guarda das medidas `_aa`:** todas (inclusive `receita_liquida_aa` e `lucro_liquido_aa`) ficam vazias quando algum mês do contexto não tem o mesmo mês do ano anterior no calendário. Sem isso, o filtro "todos os anos" compararia 36 meses com 24.

**Membro em branco:** o Direct Lake acrescenta um membro em branco às dimensões. Consultas que forçam valor (`+ 0`) ou iteram `VALUES` mostram uma linha extra com chave vazia; usar `DISTINCT` ou deixar o `SUMMARIZECOLUMNS` remover os vazios.

**Validação automatizada:** `uv run validacao/validar_modelo.py` roda as consultas de `validacao/dax/` (v01 a v06) pela API `executeQueries` e compara com `validacao/referencias.json`; a v04 generaliza a query acima para todos os recortes (mês e ano × cenário, consolidado e por região).

### Pronto quando
- [ ] Com `dim_cenario = realizado` e `ano = 2024`: `lucro_liquido` = 15.882.255,48 e `margem_liquida` = 11,7%.
- [ ] `sankey_valor` bate com a tabela "Cenários de teste do Sankey" (seção 1) e a query de validação não retorna linhas.
- [ ] `receita_liquida_aa` em 2025 = `receita_liquida` em 2024.
- [ ] Nenhuma medida retorna erro em um visual de tabela por `mes_ano`.
- [ ] Modelo compartilhado com Build + Read para os usuários do app.
- [ ] Anotar `workspace_id` e `item_id` do modelo (registrados em `.env`, fora do git: `ID_WORKSPACE`, `ID_MODELO_SEMANTICO`).

---

## 8. Fase 4 — Fabric App (`app_blacksmith_dre`)

### 8.1 Scaffold

```bash
npm create @microsoft/rayfin@latest -- "app_blacksmith_dre" --template dataapp --workspace ws_blacksmith_financeiro
cd app_blacksmith_dre
npx rayfin login
npx rayfin connector add --type fabric-semanticmodel \
  --workspace-id <workspace_id> --item-id <item_id_sm_blacksmith_dre> \
  --name modelo_dre --operations executeQuery
# rodar o npm install com versão casada que o comando acima imprimir
npm run build
```

Antes de codar, inspecionar o projeto gerado e reaproveitar o que o template já oferece: autenticação Fabric, cliente do conector, padrões de query DAX, data grid, formatação por format string e validação no navegador. **Não** criar outro fluxo de login.

### 8.2 Bibliotecas extras
- `d3-sankey` + `d3-shape` + `d3-scale` para o Sankey (o template não traz Sankey pronto).
- Fontes: `Space Grotesk` (títulos), `Inter` (texto), `JetBrains Mono` (números). Se o ambiente bloquear Google Fonts, empacotar as fontes no projeto.

### 8.3 Estrutura de pastas (snake_case)

```
src/
  dados/
    cliente_modelo.ts          # wrapper de client.connectors.modelo_dre.executeQuery()
    construtor_filtros.ts      # monta TREATAS a partir do estado dos filtros (whitelist)
    consultas_dax.ts           # todas as queries da seção 8.5
    formatacao.ts              # usa as format strings do modelo
  estado/
    estado_filtros.ts          # ano, intervalo de meses, regiões, cenário
  componentes/
    cabecalho_app.tsx
    barra_filtros.tsx
    cartao_kpi.tsx
    grafico_sankey.tsx
    grafico_tendencia.tsx
    grafico_regioes.tsx
    tabela_dre.tsx
    painel_operacional.tsx
    painel_detalhe_no.tsx      # drill ao clicar num nó do sankey
    estados_carregamento.tsx   # loading, vazio, erro
  tema/
    tokens_tema.css
    tema_graficos.ts
  pagina_principal.tsx
```

### 8.4 Layout (desktop, grade de 12 colunas; empilha no mobile)

1. **cabecalho_app**: wordmark "BLACKSMITH" com gradiente ciano→roxo, subtítulo "Do faturamento ao lucro", data da última carga.
2. **barra_filtros** (fixa no topo): ano (2024/2025/2026/todos), intervalo de meses, regiões (multi), cenário (realizado/orçado). Padrão: último ano, todas as regiões, realizado.
3. **Linha de KPIs** (6 cartões): receita líquida, lucro bruto, EBITDA, lucro líquido, margem líquida, variação vs orçado. Cada cartão traz valor, variação vs ano anterior (seta ▲ turquesa / ▼ laranja) e sparkline de 12 meses.
4. **grafico_sankey** (largura total, altura ~560 px, peça central):
   - colunas pela `coluna_sankey`; cor do nó por `cor_hex`;
   - ignorar links sem valor (a medida devolve vazio), para que os nós zerados desapareçam;
   - **prejuízo:** o nó `prejuizo_liquido` (rosa neon) entra por baixo, à esquerda da primeira camada que ele financia (posicionar em `min(coluna dos destinos) − 1`); links em rosa com textura listrada ou pulsar suave; selo "PREJUÍZO" no cartão de lucro líquido;
   - links com gradiente da cor da origem para a do destino, opacidade 0,35, 0,85 no hover, e brilho (`drop-shadow`) suave;
   - rótulos: nome do nó + valor abreviado (R$ 175,7 mi) + % da receita líquida;
   - tooltip com valor, % da receita e variação vs ano anterior;
   - clique num nó abre o **painel_detalhe_no** com a evolução mensal daquele nó;
   - animação de entrada: links "fluindo" da esquerda para a direita (respeitar `prefers-reduced-motion`);
   - no mobile, rolagem horizontal dentro do próprio contêiner.
5. **grafico_tendencia** (8 colunas): receita líquida (área com gradiente ciano) e lucro líquido (linha turquesa) por `mes_ano`; margem líquida no eixo secundário (linha roxa tracejada).
6. **grafico_regioes** (4 colunas): barras horizontais de receita líquida por região com a margem líquida em rótulo.
7. **tabela_dre** (8 colunas): data grid do template com linhas da DRE em `ordem_dre`, colunas realizado, orçado, variação %, com subtotais destacados (lucro bruto, EBITDA, EBIT, LAIR, lucro líquido).
8. **painel_operacional** (4 colunas): clientes ativos, novos clientes, churn, NPS, headcount, receita por cliente e por colaborador.

Todos os componentes têm estados de carregamento (skeleton com shimmer ciano), vazio e erro.

### 8.5 Consultas DAX

O `construtor_filtros.ts` gera os filtros abaixo **apenas com valores vindos das dimensões** (nunca texto livre), para evitar injeção:

```dax
-- exemplo de filtros gerados
TREATAS ( { "realizado" }, dim_cenario[cod_cenario] ),
TREATAS ( { 2026 }, dim_calendario[ano] ),
TREATAS ( { "sudeste", "sul" }, dim_regiao[cod_regiao] )
```

**q_kpis**
```dax
EVALUATE
SUMMARIZECOLUMNS (
    <filtros>,
    "receita_liquida", [receita_liquida],
    "lucro_bruto", [lucro_bruto],
    "ebitda", [ebitda],
    "lucro_liquido", [lucro_liquido],
    "margem_liquida", [margem_liquida],
    "var_receita_liquida_aa_pct", [var_receita_liquida_aa_pct],
    "var_lucro_liquido_aa_pct", [var_lucro_liquido_aa_pct],
    "var_lucro_liquido_orcado_pct", [var_lucro_liquido_orcado_pct]
)
```

**q_sankey_links**
```dax
EVALUATE
SUMMARIZECOLUMNS (
    dim_link_sankey[ordem_link], dim_link_sankey[cod_no_origem], dim_link_sankey[cod_no_destino],
    dim_link_sankey[tipo_link], dim_link_sankey[etapa],
    <filtros>,
    "valor", [sankey_valor]
)
ORDER BY dim_link_sankey[ordem_link]
```
SUMMARIZECOLUMNS já remove os links com valor vazio.

**q_sankey_nos**
```dax
EVALUATE dim_no_sankey ORDER BY dim_no_sankey[coluna_sankey]
```

**q_tendencia**
```dax
EVALUATE
SUMMARIZECOLUMNS (
    dim_calendario[indice_mes], dim_calendario[mes_ano],
    <filtros_sem_mes>,
    "receita_liquida", [receita_liquida],
    "lucro_liquido", [lucro_liquido],
    "margem_liquida", [margem_liquida]
)
ORDER BY dim_calendario[indice_mes]
```

**q_regioes**
```dax
EVALUATE
SUMMARIZECOLUMNS (
    dim_regiao[nome_regiao],
    <filtros_sem_regiao>,
    "receita_liquida", [receita_liquida],
    "margem_liquida", [margem_liquida]
)
ORDER BY [receita_liquida] DESC
```

**q_dre**
```dax
EVALUATE
SUMMARIZECOLUMNS (
    dim_conta[ordem_dre], dim_conta[nome_conta], dim_conta[nome_grupo],
    <filtros_sem_cenario>,
    "realizado", CALCULATE ( [valor_dre], dim_cenario[cod_cenario] = "realizado" ),
    "orcado", CALCULATE ( [valor_dre], dim_cenario[cod_cenario] = "orcado" )
)
ORDER BY dim_conta[ordem_dre]
```
Subtotais (lucro bruto, EBITDA etc.) calculados no front a partir das linhas, ou via uma segunda query com as medidas de subtotal.

**q_operacional**
```dax
EVALUATE
SUMMARIZECOLUMNS (
    <filtros_sem_cenario>,
    "clientes_ativos", [clientes_ativos], "novos_clientes", [novos_clientes],
    "churn_medio_pct", [churn_medio_pct], "nps_medio", [nps_medio],
    "headcount", [headcount], "receita_por_cliente", [receita_por_cliente],
    "receita_por_colaborador", [receita_por_colaborador]
)
```

**q_detalhe_no** (valor do nó = soma das entradas; para nós de receita e `prejuizo_liquido`, que só têm saídas, usar `cod_no_origem`)
```dax
EVALUATE
SUMMARIZECOLUMNS (
    dim_calendario[indice_mes], dim_calendario[mes_ano],
    <filtros_sem_mes>,
    "valor", SUMX ( FILTER ( ALL ( dim_link_sankey ), dim_link_sankey[cod_no_destino] = "<cod_no>" ), [sankey_valor] )
)
ORDER BY dim_calendario[indice_mes]
```
No grafico_tendencia, marcar os meses com `lucro_liquido < 0` com um ponto rosa neon e um rótulo "prejuízo".

Regras: verificar o `status` de cada resposta antes de passar colunas e linhas aos visuais; disparar as queries em paralelo; não duplicar queries.

### 8.6 Deploy e distribuição
- Rodar build e a validação no navegador do template; corrigir erros de TypeScript.
- Publicar no workspace pelo Rayfin CLI (confirmar o comando com `npx rayfin --help`).
- Limitação atual do preview: apps ligados a modelo semântico só funcionam abertos dentro do portal do Fabric.
- Opcional: incluir o app e o modelo num **org app** do workspace para distribuição com audiências.

### Pronto quando
- [ ] Build sem erros e validação do navegador ok.
- [ ] KPIs batem com a aba `dre_anual` para 2024, 2025 e 2026.
- [ ] Sankey fecha visualmente (largura de entrada = saída em cada nó) para qualquer combinação de filtros.
- [ ] mar/2025 e abr/2025 mostram o nó de prejuízo com os valores da seção 1; o ano de 2025 inteiro não mostra.
- [ ] abr/2025 só Sudeste: prejuízo; abr/2025 só Sul: lucro.
- [ ] Trocar o cenário para orçado atualiza todos os visuais.
- [ ] Estados de loading, vazio e erro testados (ex.: remover permissão temporariamente).
- [ ] Layout ok em 1440 px, 1024 px e 390 px.

---

## 9. Tema visual — dark high‑tech

### 9.1 Tokens (`tema/tokens_tema.css`)

```css
:root {
  /* superfícies */
  --cor_fundo: #05070F;
  --cor_fundo_gradiente: radial-gradient(1200px 600px at 15% -10%, #0B2A3A 0%, transparent 60%),
                         radial-gradient(900px 500px at 110% 10%, #2A0F45 0%, transparent 55%),
                         #05070F;
  --cor_superficie: #0B1020;
  --cor_superficie_2: #111833;
  --cor_borda: rgba(0, 229, 255, 0.14);
  --cor_borda_forte: rgba(0, 229, 255, 0.35);

  /* texto */
  --cor_texto: #E6F1FF;
  --cor_texto_suave: #8A9BB8;
  --cor_texto_fraco: #55627D;

  /* acentos */
  --cor_ciano: #00E5FF;       /* receitas, foco, links ativos */
  --cor_turquesa: #14F1C6;    /* lucros, variação positiva */
  --cor_laranja: #FF7A1A;     /* custos/despesas, variação negativa */
  --cor_roxo: #A855F7;        /* totais intermediários, orçado */
  --cor_rosa_neon: #FF3DCB;   /* exclusivo de prejuízo */

  /* efeitos */
  --brilho_ciano: 0 0 24px rgba(0, 229, 255, 0.35);
  --brilho_turquesa: 0 0 24px rgba(20, 241, 198, 0.30);
  --brilho_laranja: 0 0 24px rgba(255, 122, 26, 0.30);
  --gradiente_marca: linear-gradient(90deg, #00E5FF 0%, #14F1C6 35%, #A855F7 75%, #FF7A1A 100%);

  /* tipografia */
  --fonte_titulo: "Space Grotesk", "Segoe UI", system-ui, sans-serif;
  --fonte_texto: "Inter", "Segoe UI", system-ui, sans-serif;
  --fonte_numero: "JetBrains Mono", "Cascadia Mono", Consolas, monospace;

  /* forma */
  --raio: 14px;
  --espaco: 16px;
}
```

### 9.2 Diretrizes
- Cartões em vidro escuro: fundo `--cor_superficie` com 85% de opacidade, `backdrop-filter: blur(12px)`, borda `--cor_borda` e, no hover, borda `--cor_borda_forte` + `--brilho_ciano`.
- Linha de 2 px com `--gradiente_marca` no topo do cabeçalho e no cartão em foco.
- Números grandes em `--fonte_numero`, com `font-variant-numeric: tabular-nums`.
- Grade sutil de fundo (linhas a cada 32 px, 3% de opacidade) para o ar "painel de controle".
- Semântica de cor fixa: ciano = receita; roxo = totais e orçado; laranja = custo e queda; turquesa = lucro e alta; rosa neon = prejuízo (uso exclusivo).
- Contraste mínimo AA para texto; nada de texto laranja ou roxo sobre fundo escuro abaixo de 14 px.
- Animações curtas (200–400 ms, `ease-out`), desligadas com `prefers-reduced-motion`.

### 9.3 Paleta dos gráficos (`tema/tema_graficos.ts`)

```ts
export const paleta_graficos = {
  receita: "#00E5FF",
  total: "#A855F7",
  custo: "#FF7A1A",
  lucro: "#14F1C6",
  prejuizo: "#FF3DCB",
  serie_extra: ["#00E5FF", "#14F1C6", "#A855F7", "#FF7A1A", "#FF3DCB"],
  grade: "rgba(138, 155, 184, 0.12)",
  eixo: "#55627D",
  tooltip_fundo: "rgba(11, 16, 32, 0.95)",
};
```

A coluna `dim_no_sankey[cor_hex]` já usa essa paleta: receita `#00E5FF`, total `#A855F7`, custo `#FF7A1A`, lucro `#14F1C6`, prejuízo `#FF3DCB`.

---

## 10. Plano B — relatório Power BI (low‑code)

Se o Fabric App não estiver liberado no tenant, publicar um relatório `rpt_blacksmith_dre` sobre o mesmo `sm_blacksmith_dre` com o visual Sankey do AppSource, usando `dim_link_sankey[cod_no_origem]`, `dim_link_sankey[cod_no_destino]` e `[sankey_valor]` (a mesma lógica de prejuízo funciona no relatório), o mesmo layout da seção 8.4 e um tema JSON com as cores da seção 9. Distribuir via org app.

---

## 11. Roteiro do "momento prejuízo" na demo

1. Abrir com 2026 (ano forte): fluxo limpo até o lucro líquido em turquesa.
2. Trocar para 2025: lucro menor, sem prejuízo no ano. Perguntar à equipe "onde foi parar a margem?".
3. Mostrar a tendência: dois pontos rosa em mar e abr/2025.
4. Filtrar mar/2025: o EBITDA some e o nó rosa "Prejuízo Líquido" aparece financiando despesas, D&A e financeiro. Clicar em Despesas Não Recorrentes.
5. Filtrar abr/2025 e alternar regiões: só o Sudeste fica no vermelho.
6. Trocar para orçado: o orçamento não previa o evento, e a variação aparece no cartão.

---

## 12. Ordem de execução para o Claude

1. Confirmar com o usuário os pré‑requisitos da Fase 0 (não é possível checar o tenant sozinho).
2. Gerar os notebooks `nb_01_ingestao`, `nb_02_qualidade` e `nb_03_atualizar_modelo` em `fabric/` (formato Git do Fabric) e implantar com o fab CLI (`fab import … --format .py`, `fab job run`).
3. Gerar as medidas da seção 7.3 em TMDL (`fabric/sm_blacksmith_dre.SemanticModel/`) e implantar com `fab import -f`, seguido de refresh.
4. Fazer o scaffold do app (seção 8.1), inspecionar o template e só então implementar os componentes.
5. Validar contra os números da seção 1 a cada fase e registrar o resultado em `docs/log_validacao.md`.
6. Nunca usar dados reais de clientes; parar e perguntar se aparecer qualquer arquivo que não seja a base fictícia.
