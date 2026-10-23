# Blacksmith: DRE em Sankey no Microsoft Fabric

Projeto de ponta a ponta no **Microsoft Fabric** que mostra, num gráfico de **Sankey**, como a receita de uma empresa se transforma em lucro, ou em prejuízo. O caminho completo:

**CSVs → lakehouse (Delta) → testes de qualidade → modelo semântico Direct Lake (DAX) → Fabric App (React + TypeScript)**

O app segue o **IBM Carbon Design System**, abre no tema escuro e tem tema claro. Clicar num ponto de um gráfico filtra os outros, como no Power BI.

> **Os dados são 100% fictícios.** A Blacksmith é uma empresa inventada, e a base foi gerada com semente fixa (seed 42). Se você adaptar o projeto para dados reais, anonimize-os antes e nunca versione dados de clientes.

---

## Sumário

- [O que tem no projeto](#o-que-tem-no-projeto)
- [Arquitetura](#arquitetura)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Requisitos](#requisitos)
- [Instalação passo a passo](#instalação-passo-a-passo)
- [Comandos Rayfin](#comandos-rayfin)
- [Validação](#validação)
- [IDs do ambiente e segurança](#ids-do-ambiente-e-segurança)
- [Limitações conhecidas](#limitações-conhecidas)
- [Licença](#licença)

---

## O que tem no projeto

### O cenário

- **Blacksmith**, empresa de tecnologia (hardware, software, cloud e serviços) que atua nas 5 regiões do Brasil.
- **36 meses** (jan/2024 a dez/2026), em dois cenários: **realizado** e **orçado**.
- **Evento de prejuízo** para a demonstração: um recall de hardware e uma multa contratual, lançados só no realizado.
  - Em **mar/2025** a empresa fecha com **prejuízo de R$ 2,59 mi**.
  - Em **abr/2025**, com **prejuízo de R$ 0,61 mi**, e nesse mês só o Sudeste fica negativo.
  - O ano de 2025 inteiro continua lucrativo (R$ 13,09 mi).

### Os entregáveis

| camada | item | o que faz |
|---|---|---|
| Ingestão | `nb_01_ingestao` | Lê os 7 CSVs com schema explícito (`FAILFAST`) e grava 8 tabelas Delta com V-Order. |
| Qualidade | `nb_02_qualidade` | Testa contagens, chaves, integridade referencial, regras de sinal, estrutura do Sankey e os lucros de referência. Falha se algum teste falhar. |
| Atualização | `nb_03_atualizar_modelo` | Faz o refresh do modelo com semantic link, só depois que a qualidade passa. |
| Orquestração | `pl_blacksmith_carga` | Pipeline que encadeia nb_01 → nb_02 → nb_03. |
| Modelo | `sm_blacksmith_dre` | Modelo Direct Lake on OneLake em TMDL, com 53 medidas DAX: DRE, margens, comparativos com o ano anterior e com o orçado, indicadores operacionais e o Sankey. |
| App | `app_blacksmith_dre` | Fabric App com KPIs, Sankey, tendência mensal, regiões, tabela da DRE e painel operacional, além de filtragem cruzada e tema claro/escuro. |
| Validação | `validacao/` e scripts do app | Comparam o modelo e as consultas do app com o gabarito `validacao/referencias.json` (tolerância de R$ 1,00). |

### A lógica do prejuízo no Sankey

A medida `sankey_valor` calcula cada link sobre os valores já agregados no filtro. A receita líquida vai "pagando" cada camada de gasto, em cascata: custos, despesas operacionais, D&A, resultado financeiro e IR/CSLL.

- Quando a receita acaba, a parte não coberta de cada gasto passa a sair do nó **Prejuízo Líquido**.
- Os subtotais zerados (EBITDA, EBIT…) somem do gráfico.
- Somar links pré-calculados mês a mês mostraria lucro e prejuízo ao mesmo tempo. Calcular sobre o agregado evita isso.

A especificação completa (dicionário de dados, todas as medidas, consultas, layout, tema e regras de filtragem cruzada) está em [CLAUDE.md](CLAUDE.md). O histórico de cada validação está em [docs/log_validacao.md](docs/log_validacao.md).

---

## Arquitetura

```
dataset/*.csv ──► lh_blacksmith/Files/Raw/blacksmith/
                     │  nb_01_ingestao
                     ▼
                tabelas Delta (lh_blacksmith/Tables/dbo)          ┐
                     │  nb_02_qualidade (testes)                   │ pl_blacksmith_carga
                     │  nb_03_atualizar_modelo (refresh)           ┘
                     ▼
                sm_blacksmith_dre (Direct Lake on OneLake, DAX)
                     │  Execute Queries API (@microsoft/fabric-app-data)
                     ▼
                app_blacksmith_dre (Fabric App, template dataapp do Rayfin)
```

Nomes usados nos exemplos (troque se quiser):

| item | nome |
|---|---|
| workspace | `ws_blacksmith_financeiro` |
| lakehouse | `lh_blacksmith` |
| notebooks | `nb_01_ingestao`, `nb_02_qualidade`, `nb_03_atualizar_modelo` |
| pipeline | `pl_blacksmith_carga` |
| modelo semântico | `sm_blacksmith_dre` |
| app | `app_blacksmith_dre` |

---

## Estrutura do repositório

```
dataset/                         # 7 CSVs da base fictícia
fabric/                          # itens do Fabric no formato Git (com marcadores de ID)
  nb_01_ingestao.Notebook/
  nb_02_qualidade.Notebook/
  nb_03_atualizar_modelo.Notebook/
  pl_blacksmith_carga.DataPipeline/
  sm_blacksmith_dre.SemanticModel/   # TMDL
  ids_ambiente.py                # troca marcadores ↔ IDs do .env
validacao/
  gerar_referencias.py           # gera referencias.json a partir de dataset/
  referencias.json               # gabarito (anual, mensal, Sankey, regiões)
  validar_modelo.py              # roda as consultas de dax/ no modelo e compara
  dax/v01..v06_*.dax
app_blacksmith_dre/              # Fabric App (Vite + React 19 + TypeScript)
  src/dados/                     # consultas DAX, construtor de filtros, layout do Sankey
  src/componentes/               # cabeçalho, filtros, KPIs, Sankey, tendência, regiões, DRE…
  src/estado/                    # filtros, tema e seleção cruzada
  src/tema/                      # tokens Carbon (CSS) e paleta dos gráficos (TS)
  scripts/                       # validar_consultas.mjs, validate-visual.mjs
  rayfin/rayfin.yml              # configuração do item Rayfin
  fabric.example.yaml            # modelo do fabric.yaml (conexão com o modelo semântico)
docs/log_validacao.md            # registro das validações de cada fase
CLAUDE.md                        # especificação completa do projeto
.env.example                     # modelo do .env com os IDs do ambiente
```

O `app_blacksmith_dre/README.md` é o README original do template da Microsoft. Este arquivo é o guia do projeto.

---

## Requisitos

### No Fabric

| requisito | por quê |
|---|---|
| Workspace em **capacidade Fabric** (SKU F) | Fabric Apps não funciona em capacidade compartilhada nem em Pro. |
| Papel **Contributor**, **Member** ou **Admin** no workspace | Para criar itens, importar definições e publicar o app. |
| Workload **Fabric Apps** habilitado no tenant | Fabric Apps está em preview e precisa ser liberado pelo administrador. |
| Configuração **Semantic Model Execute Queries REST API** habilitada (também aparece como *Dataset Execute Queries REST API*) | O app e os scripts de validação consultam o modelo por essa API. |
| Permissões **Build** e **Read** no modelo para quem for usar o app | O app consulta o modelo com a identidade de quem está usando. |

### Na máquina de desenvolvimento

| ferramenta | versão usada | para quê | instalação |
|---|---|---|---|
| Git | qualquer recente | clonar o repositório | https://git-scm.com |
| Node.js + npm | 20 ou superior (testado com 24) | app, build e Rayfin CLI | https://nodejs.org |
| Python | 3.13 | fab CLI e scripts de `validacao/` e `fabric/` | https://www.python.org ou via `uv` |
| uv | recente | rodar os scripts Python e instalar o fab CLI | https://docs.astral.sh/uv/ |
| Fabric CLI (`fab`) | 1.8 | criar e importar itens, rodar jobs, consultar o modelo | `uv tool install --python 3.13 ms-fabric-cli` |
| Azure CLI (`az`) | recente | token para `npm run validar:consultas` e `npm run validate:visual` | https://learn.microsoft.com/cli/azure/install-azure-cli |
| Rayfin CLI | 1.36.2 | login, deploy e status do app | já vem nas dependências do app (`npx rayfin`) |
| VS Code | opcional | edição; o projeto foi construído com o Claude Code | https://code.visualstudio.com |

O fab CLI exige Python **entre 3.10 e 3.13**. Com uma versão mais nova, a instalação pode resolver silenciosamente uma versão 0.x antiga. Por isso o comando acima fixa `--python 3.13`.

---

## Instalação passo a passo

Os comandos usam a sintaxe do Bash. No PowerShell, troque `cp` por `Copy-Item` e mantenha as aspas.

### 1. Clonar e configurar o `.env`

```bash
git clone <url-do-repositorio> dre-blacksmith
cd dre-blacksmith
cp .env.example .env
```

O `.env` fica fora do git e guarda os IDs do seu ambiente. Ele é preenchido ao longo dos passos abaixo.

### 2. Entrar no Fabric pelo fab CLI

```bash
fab auth login
fab auth status
```

### 3. Criar o workspace e o lakehouse

No portal do Fabric:

1. Crie o workspace `ws_blacksmith_financeiro` numa capacidade Fabric.
2. Crie o lakehouse `lh_blacksmith` com **schemas** habilitados (as tabelas vão para `dbo`).
3. Em `Files`, crie a pasta `Raw/blacksmith` e envie os 7 CSVs de `dataset/`. O OneLake diferencia maiúsculas: o notebook lê `Files/Raw/blacksmith` (parâmetro `caminho_raw` do `nb_01`).

Depois, anote os IDs no `.env`:

```bash
fab get "ws_blacksmith_financeiro.Workspace" -q id                         # -> ID_WORKSPACE
fab get "ws_blacksmith_financeiro.Workspace/lh_blacksmith.Lakehouse" -q id  # -> ID_LAKEHOUSE
```

### 4. Importar e rodar os notebooks

Os arquivos em `fabric/` têm marcadores (`{{ID_WORKSPACE}}`, `{{ID_LAKEHOUSE}}`…) no lugar dos IDs. O script `ids_ambiente.py` gera em `.implantacao/fabric/` (fora do git) uma cópia com os IDs do seu `.env`. Na primeira vez, passe só os itens cujos IDs você já tem:

```bash
uv run fabric/ids_ambiente.py implantar nb_01_ingestao.Notebook nb_02_qualidade.Notebook nb_03_atualizar_modelo.Notebook

fab import "ws_blacksmith_financeiro.Workspace/nb_01_ingestao.Notebook" -i .implantacao/fabric/nb_01_ingestao.Notebook --format .py -f
fab import "ws_blacksmith_financeiro.Workspace/nb_02_qualidade.Notebook" -i .implantacao/fabric/nb_02_qualidade.Notebook --format .py -f
fab import "ws_blacksmith_financeiro.Workspace/nb_03_atualizar_modelo.Notebook" -i .implantacao/fabric/nb_03_atualizar_modelo.Notebook --format .py -f

fab job run "ws_blacksmith_financeiro.Workspace/nb_01_ingestao.Notebook"   # cria as 8 tabelas Delta
fab job run "ws_blacksmith_financeiro.Workspace/nb_02_qualidade.Notebook"  # deve terminar com "qualidade ok"
```

Anote os IDs dos notebooks no `.env` (`ID_NB_01_INGESTAO`, `ID_NB_02_QUALIDADE`, `ID_NB_03_ATUALIZAR_MODELO`):

```bash
fab get "ws_blacksmith_financeiro.Workspace/nb_01_ingestao.Notebook" -q id
fab get "ws_blacksmith_financeiro.Workspace/nb_02_qualidade.Notebook" -q id
fab get "ws_blacksmith_financeiro.Workspace/nb_03_atualizar_modelo.Notebook" -q id
```

### 5. Importar o modelo semântico e o pipeline

```bash
uv run fabric/ids_ambiente.py implantar   # agora com todos os IDs

fab import "ws_blacksmith_financeiro.Workspace/sm_blacksmith_dre.SemanticModel" -i .implantacao/fabric/sm_blacksmith_dre.SemanticModel -f
fab import "ws_blacksmith_financeiro.Workspace/pl_blacksmith_carga.DataPipeline" -i .implantacao/fabric/pl_blacksmith_carga.DataPipeline -f

fab get "ws_blacksmith_financeiro.Workspace/sm_blacksmith_dre.SemanticModel" -q id   # -> ID_MODELO_SEMANTICO
```

No portal, abra as configurações do `sm_blacksmith_dre` e **desligue** "Keep your Direct Lake data up to date". Assim o modelo só recebe dados novos depois que os testes de qualidade passam, pelo `nb_03` do pipeline.

### 6. Rodar a carga completa

```bash
fab job run "ws_blacksmith_financeiro.Workspace/pl_blacksmith_carga.DataPipeline"   # nb_01 → nb_02 → nb_03
uv run validacao/validar_modelo.py                                                    # 0 falhas esperadas
```

### 7. Configurar o app

```bash
cd app_blacksmith_dre
npm install
npx rayfin login

# conexão com o modelo (gera fabric.yaml, fora do git; ver fabric.example.yaml)
npx fabric-app-data add semanticModel modelo_dre -w <ID_WORKSPACE> -i <ID_MODELO_SEMANTICO>

npm run build
```

O nome `modelo_dre` é o alias que o código usa (`getFabricClient().semanticModel("modelo_dre")`). Mantenha esse nome.

### 8. Publicar o app

```bash
npx rayfin up --workspace ws_blacksmith_financeiro --item-name app_blacksmith_dre
npx rayfin up status --workspace ws_blacksmith_financeiro --item-name app_blacksmith_dre
```

O primeiro `rayfin up` cria o item no workspace e grava `rayfin/.env` e `rayfin/.deployments.json`, ambos fora do git. Ele também acrescenta a URL de hospedagem do app em `allowedRedirectUris` no `rayfin/rayfin.yml`: **não versione essa linha** (veja [IDs do ambiente e segurança](#ids-do-ambiente-e-segurança)).

Abra o app pelo portal do Fabric, no workspace. Enquanto o recurso estiver em preview, apps ligados a modelo semântico só funcionam dentro do portal.

### 9. Desenvolver localmente (opcional)

```bash
npm run dev
```

O `predev` roda `rayfin env`, que lê o `rayfin/.env` criado pelo primeiro deploy. Abra o item do app no portal e acrescente `&devUri=http://localhost:5173` ao fim da URL: o portal passa a carregar o app do seu servidor local.

---

## Comandos Rayfin

Todos rodam dentro de `app_blacksmith_dre/` com `npx`, porque o Rayfin CLI já está nas dependências do projeto.

| comando | quando usar |
|---|---|
| `npx rayfin login` | Entrar no Fabric antes do primeiro deploy ou do `npm run dev`. |
| `npx rayfin logout` | Sair e limpar as credenciais em cache. |
| `npx rayfin up --workspace <workspace> --item-name app_blacksmith_dre` | Fazer build e publicar o app no workspace. Cria o item na primeira vez e atualiza o mesmo item nas seguintes. |
| `npx rayfin up --workspace-uri "<url-do-workspace>"` | Alternativa a `--workspace`, a partir da URL do workspace no portal. |
| `npx rayfin up --dry-run` | Validar a configuração e resolver o workspace sem publicar. |
| `npx rayfin up status --workspace <workspace> --item-name app_blacksmith_dre` | Conferir a saúde do app publicado. |
| `npx rayfin env --framework vite` | Gerar o `.env.local` a partir do `rayfin/.env` (o `npm run dev` e o `npm run build` já fazem isso). |
| `npx rayfin docs` | Consultar a documentação dos pacotes Rayfin instalados. |
| `npx rayfin --help` | Listar comandos e flags da versão instalada. Fabric Apps está em preview, então confira sempre. |

Este app não usa `rayfin connector`, `rayfin functions` nem `rayfin secret`. A conexão com o modelo é feita pelo `@microsoft/fabric-app-data` (passo 7), e o `rayfin.yml` liga só a autenticação Fabric (SSO) e a hospedagem estática.

---

## Validação

| comando | onde | o que confere |
|---|---|---|
| `uv run validacao/gerar_referencias.py` | raiz | Regera `referencias.json` a partir dos CSVs (só se a base mudar). |
| `uv run validacao/validar_modelo.py` | raiz | DRE anual e mensal, links do Sankey, fechamento dos nós, comparativos e regiões no modelo publicado. |
| `npm test` | app | Testes unitários (vitest). |
| `npm run lint` | app | ESLint. |
| `npm run build` | app | TypeScript e build de produção. |
| `npm run validar:consultas` | app | Roda as consultas reais do app no modelo, incluindo os recortes de filtragem cruzada, e compara com o gabarito. Exige `az login`. |
| `npm run validate:visual -- src/dados/visuais/tendencia.ts '<contexto-json>'` | app | Renderiza um gráfico sem navegador, com dados reais. Exige `az login`. |

Números de referência (realizado, consolidado):

| métrica | 2024 | 2025 | 2026 |
|---|---|---|---|
| receita líquida | 135.461.230,60 | 154.819.681,80 | 175.717.045,70 |
| lucro líquido | 15.882.255,48 | 13.088.163,15 | 24.560.318,22 |
| margem líquida | 11,7% | 8,5% | 14,0% |

Roteiro de demonstração sugerido: seção 11 do [CLAUDE.md](CLAUDE.md).

---

## IDs do ambiente e segurança

- **Nenhum ID de tenant, workspace, item ou capacidade é versionado.**
  - Os itens em `fabric/` usam marcadores `{{ID_*}}`, e os valores ficam no `.env`, que não é versionado.
  - `uv run fabric/ids_ambiente.py implantar` gera a cópia com IDs em `.implantacao/`, que também não é versionada.
- Se você exportar um item do portal (`fab export`) para dentro de `fabric/`, rode `uv run fabric/ids_ambiente.py anonimizar` **antes do commit** e confira o `git diff`.
- O `rayfin up` grava a URL de hospedagem do app no `rayfin/rayfin.yml`. Remova essa linha antes do commit, ou não faça commit desse arquivo depois de um deploy.
- O app não guarda credenciais. A autenticação é a nativa do Fabric (Entra ID), e cada usuário consulta o modelo com a própria identidade.
- Não cole dados reais de clientes em prompts, commits, issues ou logs.

---

## Limitações conhecidas

- **Fabric Apps está em preview.** Comandos, pacotes e comportamento podem mudar. As versões usadas estão em `app_blacksmith_dre/package.json` e `app_blacksmith_dre/rayfin/.lockfile.json`.
- Apps ligados a modelo semântico só abrem **dentro do portal do Fabric**.
- O teste `scripts/validate-visual.spec.mjs`, que vem do template, falha no vitest atual ("Cannot spy on export"). O script `validate:visual` em si funciona.
- A `culture` do modelo é `en-US`, porque o serviço não deixa trocar o idioma de um modelo existente. Os formatos são explícitos (`R$`, `%`), e o app formata em pt-BR.
- O plano B (relatório Power BI com visual Sankey do AppSource) está descrito na seção 10 do [CLAUDE.md](CLAUDE.md), mas não foi implementado.

---

## Licença

[MIT](LICENSE). O código herdado do template de Fabric Apps da Microsoft, em `app_blacksmith_dre/`, mantém a licença MIT original ([app_blacksmith_dre/LICENSE](app_blacksmith_dre/LICENSE)).
