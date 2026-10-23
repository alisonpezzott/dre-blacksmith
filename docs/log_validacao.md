# Log de validação: Blacksmith DRE

Gabarito: `validacao/referencias.json`, gerado de `dataset/` por `validacao/gerar_referencias.py` (substitui as abas `dre_anual` e `resultado_mensal` do Excel, que não está no repositório). Diferença tolerada: R$ 1,00.

## Passo 0: preparação local

| data | verificação | esperado | obtido | status |
|---|---|---|---|---|
| 2026-10-22 | Pré-requisitos da Fase 0 (capacidade Fabric, papel no workspace, Execute Queries REST API, workload Fabric Apps) | confirmados | confirmados na conversa de planejamento | ok |
| 2026-10-22 | Node.js ≥ 20 (Fase 4) | ≥ 20 | v24.20.0 | ok |
| 2026-10-22 | fab CLI | instalado | 1.8.0 (Python 3.13, via `uv tool`) | ok |
| 2026-10-22 | `gerar_referencias.py`: ruff format, ruff check, mypy --strict | sem apontamentos | sem apontamentos | ok |
| 2026-10-22 | Lucro líquido realizado 2024 / 2025 / 2026 (local) | 15.882.255,48 / 13.088.163,15 / 24.560.318,22 | 15.882.255,48 / 13.088.163,15 / 24.560.318,22 | ok |
| 2026-10-22 | Margem líquida realizada 2024 / 2025 / 2026 (local) | 11,7% / 8,5% / 14,0% | 11,72% / 8,45% / 13,98% | ok |
| 2026-10-22 | Meses com prejuízo consolidado, realizado (local) | 2025-03, 2025-04 | 2025-03, 2025-04 | ok |
| 2026-10-22 | Fechamento do Sankey: mês, mês × região, ano e ano × região, 2 cenários (local) | 0 falhas | 468 recortes, 0 falhas | ok |

## Fase 1: ingestão

CSVs em `Files/Raw/blacksmith/` (pasta criada no portal com "R" maiúsculo; o parâmetro `caminho_raw` do `nb_01` acompanha).

| data | verificação | esperado | obtido | status |
|---|---|---|---|---|
| 2026-10-23 | `nb_01_ingestao` via `fab job run` | Completed, asserts de contagem ok | Completed | ok |
| 2026-10-23 | Tabelas Delta em `dbo` | 8 tabelas | dim_calendario, dim_cenario, dim_conta, dim_link_sankey, dim_no_sankey, dim_regiao, fato_lancamentos, fato_operacional | ok |
| 2026-10-23 | Contagens (assert no `nb_01`) | 36 / 19 / 5 / 30 / 33 / 6.484 / 180 / 2 | conferidas pelo assert | ok |
| 2026-10-23 | Tipos (`fab table schema`) | nenhuma coluna numérica ou de data como string | data `date`; ano, mes, indice_mes, ordem_dre, coluna_sankey, etapa, ordem_link, ordem_cenario e contagens `integer`; valor e valor_dre `decimal(18,2)`; churn_pct `double`; data_hora_carga `timestamp` | ok |

## Fase 2: qualidade

| data | verificação | esperado | obtido | status |
|---|---|---|---|---|
| 2026-10-23 | `nb_02_qualidade` via `fab job run` | Completed (`qualidade ok`) | Completed | ok |
| 2026-10-23 | Lucro líquido realizado 2024 / 2025 / 2026 (assert) | 15.882.255,48 / 13.088.163,15 / 24.560.318,22 ± R$ 1 | conferido pelo assert | ok |
| 2026-10-23 | Meses com prejuízo consolidado (assert) | realizado: 2025-03 e 2025-04; orçado: nenhum | conferido pelo assert | ok |
| 2026-10-23 | Teste 3 corrigido: link folha só para contas de grupos com 2+ contas | nenhuma conta sem link folha | conferido pelo assert | ok |

## Fase 3: modelo semântico

Validação automatizada: `uv run validacao/validar_modelo.py` roda as consultas de `validacao/dax/` pela API `executeQueries` (via `fab api`) e compara com `referencias.json`. O MCP Fabric IQ conectou no modelo, mas não devolveu linhas; por isso a validação foi feita pela API REST, com o mesmo login.

| data | verificação | esperado | obtido | status |
|---|---|---|---|---|
| 2026-10-23 | Tipo de Direct Lake (`expressions.tmdl`) | Direct Lake on OneLake | `AzureStorage.DataLake` | ok |
| 2026-10-23 | Import do TMDL (relacionamentos, `_medidas` calculada, 53 medidas, colunas) | aceito | aceito; `culture` mantida em en-US (o serviço não permite trocar o idioma de um modelo existente) | ok |
| 2026-10-23 | Refresh (reenquadramento) | Completed | Completed | ok |
| 2026-10-23 | v01 DRE anual, 3 anos × 2 cenários (13 linhas da DRE + 3 margens) | = `referencias.json` (± R$ 1) | 6/6 recortes iguais; realizado 2024: LL 15.882.255,48, margem 11,7% | ok |
| 2026-10-23 | v02 resultado mensal e meses com prejuízo | 72 recortes; 2 meses em 2025 realizado | 72/72; realizado 2025 = 2, demais 0 | ok |
| 2026-10-23 | v03 Sankey mar/2025, abr/2025, 2025, abr/2025 Sudeste e Sul | tabela da seção 1 / `referencias.json` | todos os links iguais (ex.: prejuízo → despesas operacionais mar/2025 = 2.071.798,75; lair → lucro líquido 2025 = 13.088.163,15) | ok |
| 2026-10-23 | v04 fechamento dos nós: mês e ano × cenário, consolidado e por região | 0 linhas | 0 linhas nas 4 consultas | ok |
| 2026-10-23 | v05 `receita_liquida_aa` 2025 = `receita_liquida` 2024; `_aa` extras; guarda em "todos os anos" | iguais; vazias sem ano anterior | iguais; vazias em 2024 e em todos os anos | ok |
| 2026-10-23 | v05c medidas sem erro por `mes_ano` | 36 meses, 0 erros | 36 meses, 0 erros | ok |
| 2026-10-23 | v06 abr/2025 por região | só o Sudeste negativo e com links de prejuízo | Sudeste −865.507,86; links de prejuízo só no Sudeste | ok |
| 2026-10-23 | IDs do workspace, lakehouse e modelo | registrados | em `.env` | ok |
| 2026-10-23 | Compartilhar o modelo (Read + Build) com os usuários do app | — | adiado: por enquanto ninguém além do dono precisa de acesso | adiado |

Observação para a Fase 4: o Direct Lake acrescenta um membro em branco às dimensões. Consultas que forçam valor (`+ 0`) ou iteram `VALUES` mostram uma linha extra com chave vazia; usar `DISTINCT` ou deixar o `SUMMARIZECOLUMNS` remover os vazios.

## Pipeline `pl_blacksmith_carga`

| data | verificação | esperado | obtido | status |
|---|---|---|---|---|
| 2026-10-23 | `fab job run` do pipeline: nb_01 → nb_02 → nb_03 | Completed | Completed | ok |
| 2026-10-23 | Revalidação do modelo após o pipeline (`validar_modelo.py`) | 0 falhas | 31 verificações, 0 falhas | ok |
| 2026-10-23 | `data_ultima_carga` | horário da execução (Brasília) | 23/10/2026 00:25 | ok |
| 2026-10-23 | Desligar "Keep your Direct Lake data up to date" no modelo | desligado | desligado no portal; reenquadramento só pelo `nb_03` do pipeline | ok |

## Fase 4: Fabric App `app_blacksmith_dre`

Template `dataapp` (Rayfin CLI 1.36.2). A conexão com o `sm_blacksmith_dre` é pelo `fabric-app-data` (`fabric.yaml`, fora do git; modelo em `fabric.example.yaml`), não pelo `rayfin connector add` da seção 8.1. Validação local: `npm run validar:consultas` roda as consultas reais do app (`src/dados/consultas_dax.ts`) contra o modelo e compara com `referencias.json`; requer o Azure CLI logado.

| data | verificação | esperado | obtido | status |
|---|---|---|---|---|
| 2026-10-23 | `validar:consultas`: KPIs 2024/2025/2026 nos dois cenários, links do Sankey (mar/2025, abr/2025, 2025), fechamento dos nós, regiões em abr/2025, tendência, DRE e subtotais | 0 falhas | 149 verificações, 0 falhas | ok |
| 2026-10-23 | abr/2025 só Sudeste / só Sul (`q_kpis`) | prejuízo / lucro | prejuízo / lucro | ok |
| 2026-10-23 | `npm run validate:visual` (tendência, regiões, detalhe do nó) | todos renderizam | 6/6 | ok |
| 2026-10-23 | Testes unitários do app (`vitest run src`) | sem falhas | 48 testes, 0 falhas | ok |
| 2026-10-23 | `tsc --noEmit` e `npm run build` | sem erros | sem erros | ok |
| 2026-10-23 | `rayfin up` em `ws_blacksmith_financeiro`, item `app_blacksmith_dre` | publicado e saudável | publicado; `rayfin up status` Reachable | ok |
| 2026-10-23 | Lint: `use-semantic-model-query.ts` (hook do template, não usado pelo app) e teste `scripts/validate-visual.spec.mjs` do template | — | 1 erro de lint e 1 teste falhando, ambos do template | registrado |
| 2026-10-23 | No portal: KPIs batem com a seção 1, Sankey de mar/2025 e abr/2025, 2025 sem prejuízo, troca para orçado, drill de nó | conforme seção 8.6 | conferido no portal pelo dono do projeto | ok |
| 2026-10-23 | Estados de loading, vazio e erro; layout em 1440, 1024 e 390 px | ok | conferido no portal pelo dono do projeto | ok |

### Tema IBM Carbon e filtragem cruzada

Paleta e tipografia trocadas pelo IBM Carbon (escuro g100 padrão, claro g10 no cabeçalho; IBM Plex Sans/Mono) e filtragem cruzada entre os visuais (seções 8.4.1 e 9 do CLAUDE.md).

| data | verificação | esperado | obtido | status |
|---|---|---|---|---|
| 2026-10-23 | `validar:consultas` com os recortes de filtragem cruzada (mar+abr/2025 por seleção, abr/2025 filtrando regiões, Sankey de mar/2025 por seleção, Sudeste em abr/2025, origem não se filtra) | 0 falhas | 183 verificações, 0 falhas | ok |
| 2026-10-23 | `validate:visual` com seleção (tendência por mês e por região, regiões com filtro + seleção, detalhe do nó) | todos renderizam, meses em ordem | 4/4; eixo Jan a Dez/2025 em ordem | ok |
| 2026-10-23 | Testes unitários (`vitest run`): seleção cruzada no construtor de filtros e nos eventos dos visuais | sem falhas novas | 70 ok; só o teste do template (`validate-visual.spec.mjs`) falha, como antes | ok |
| 2026-10-23 | `tsc -b` e `npm run build` | sem erros | sem erros | ok |
| 2026-10-23 | `rayfin up` em `ws_blacksmith_financeiro`, item `app_blacksmith_dre` (mesmo item) | publicado e saudável | publicado; `rayfin up status` Reachable | ok |
| 2026-10-23 | No portal: tema escuro/claro em todos os visuais (inclusive Sankey, Vega e data grid) e persistência da escolha, contraste AA, cliques de filtragem cruzada (mar/2025, Ctrl+clique em abr/2025, Sudeste em abr/2025, Esc), visual de origem só esmaece | conforme seção 8.6 do CLAUDE.md | conferido no portal pelo dono do projeto, após a correção da tendência mensal | ok |
| 2026-10-23 | Correção da tendência mensal: no portal a área de plotagem ficava com 0 px (linhas retas, um rótulo no eixo). O `VegaVisual` copia o `displayName` para todo canal sem `title`, camada a camada; o título concatenado do eixo esquerdo, girado, passava da altura do contêiner. `title: null` em cada `y` interno | eixo com vários rótulos, sem título | `renderVisualToSvg` com os metadados reais: R$ 5/10/15 mi e 0–10%, sem título; `tsc -b` e `npm run build` sem erros | ok |
