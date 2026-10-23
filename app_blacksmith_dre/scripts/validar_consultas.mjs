// Roda as consultas reais do app (src/dados/consultas_dax.ts) contra o sm_blacksmith_dre
// e compara com validacao/referencias.json. Uso: npm run validar:consultas
// Requer o Azure CLI logado (o fabric-app-data obtém o token por `az account get-access-token`).

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createServer } from "vite";

const exec_file = promisify(execFile);
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tolerancia = 1.0;

const referencias = JSON.parse(await readFile(resolve(raiz, "../validacao/referencias.json"), "utf-8"));
const servidor = await createServer({ root: raiz, appType: "custom", logLevel: "error", server: { middlewareMode: true } });
const c = await servidor.ssrLoadModule("/src/dados/consultas_dax.ts");

const cli = resolve(dirname(fileURLToPath(import.meta.resolve("@microsoft/fabric-app-data-cli"))), "cli.js");

async function executar(query) {
    let stdout;
    try {
        ({ stdout } = await exec_file(process.execPath, [cli, "query", "semanticModel", c.conexao_modelo, "-q", query], {
            cwd: raiz,
            maxBuffer: 20 * 1024 * 1024,
            timeout: 120_000,
            windowsHide: true,
        }));
    } catch (erro) {
        stdout = erro.stdout ?? "";
        if (!stdout) throw erro;
    }
    const resultado = JSON.parse(stdout);
    if (resultado.status !== "success") {
        throw new Error(`${resultado.error?.category}: ${resultado.error?.message}\n${query}`);
    }
    const nomes = resultado.table.columns.map((col) => col.name.replace(/^.*\[(.*)\]$/, "$1"));
    return resultado.table.rows.map((linha) => Object.fromEntries(linha.map((v, i) => [nomes[i], v])));
}

const falhas = [];
let verificacoes = 0;

function conferir(rotulo, obtido, esperado) {
    verificacoes += 1;
    const ok = typeof esperado === "number"
        ? typeof obtido === "number" && Math.abs(obtido - esperado) <= tolerancia
        : obtido === esperado;
    if (!ok) falhas.push(`${rotulo}: esperado ${esperado}, obtido ${obtido}`);
}

const anos = (await executar(c.q_anos)).map((l) => l.ano).filter((a) => a != null);
const regioes = (await executar(c.q_regioes_lista)).map((l) => l.cod_regiao).filter(Boolean);
const calendario = await executar(c.q_calendario);
const indices_mes = calendario.map((l) => l.indice_mes).filter((i) => i != null);
const dominio = { anos, regioes, indices_mes };
conferir("q_calendario meses", indices_mes.length, 36);
conferir("anos no domínio", anos.join(","), "2024,2025,2026");
conferir("regiões no domínio", regioes.length, 5);

function ctx(parcial) {
    return { dominio, filtros: { ano: 2026, mes_inicio: 1, mes_fim: 12, regioes: [], cenario: "realizado", ...parcial } };
}

// KPIs anuais nos dois cenários
for (const cenario of ["realizado", "orcado"]) {
    for (const ano of [2024, 2025, 2026]) {
        const [kpi] = await executar(c.q_kpis(ctx({ ano, cenario })));
        const ref = referencias.dre_anual[cenario][String(ano)];
        for (const m of ["receita_liquida", "lucro_bruto", "ebitda", "lucro_liquido"]) {
            conferir(`q_kpis ${cenario} ${ano} ${m}`, kpi[m], ref[m]);
        }
    }
}

// Sankey: links e fechamento dos nós nos recortes de teste
const recortes = [
    { chave: "2025-03", filtros: { ano: 2025, mes_inicio: 3, mes_fim: 3 } },
    { chave: "2025-04", filtros: { ano: 2025, mes_inicio: 4, mes_fim: 4 } },
    { chave: "2025", filtros: { ano: 2025 } },
];
for (const recorte of recortes) {
    const links = await executar(c.q_sankey_links(ctx(recorte.filtros)));
    const obtidos = Object.fromEntries(links.map((l) => [`${l.cod_no_origem}__${l.cod_no_destino}`, l.valor]));
    const esperados = referencias.sankey_realizado[recorte.chave].todas;
    for (const [cod_link, valor] of Object.entries(esperados)) {
        conferir(`q_sankey_links ${recorte.chave} ${cod_link}`, obtidos[cod_link], valor);
    }
    conferir(`q_sankey_links ${recorte.chave} quantidade de links`, links.length, Object.keys(esperados).length);
    const saldo = {};
    for (const l of links) {
        saldo[l.cod_no_origem] = (saldo[l.cod_no_origem] ?? 0) - l.valor;
        saldo[l.cod_no_destino] = (saldo[l.cod_no_destino] ?? 0) + l.valor;
    }
    const com_entrada = new Set(links.map((l) => l.cod_no_destino));
    const com_saida = new Set(links.map((l) => l.cod_no_origem));
    for (const no of com_entrada) {
        if (com_saida.has(no)) conferir(`fechamento ${recorte.chave} ${no}`, Math.abs(saldo[no]) <= 0.05, true);
    }
}

// Regiões em abr/2025: só o Sudeste negativo
const regioes_abr = await executar(c.q_regioes(ctx({ ano: 2025, mes_inicio: 4, mes_fim: 4 })));
for (const [cod, valor] of Object.entries(referencias.lucro_liquido_por_regiao["2025-04"])) {
    conferir(`q_regioes 2025-04 ${cod}`, regioes_abr.find((l) => l.cod_regiao === cod)?.lucro_liquido, valor);
}
const [sudeste] = await executar(c.q_kpis(ctx({ ano: 2025, mes_inicio: 4, mes_fim: 4, regioes: ["sudeste"] })));
conferir("abr/2025 só Sudeste tem prejuízo", sudeste.prejuizo_liquido > 0, true);
const [sul] = await executar(c.q_kpis(ctx({ ano: 2025, mes_inicio: 4, mes_fim: 4, regioes: ["sul"] })));
conferir("abr/2025 só Sul tem lucro", sul.lucro_liquido > 0, true);

// Tendência: 12 meses, prejuízo só em mar e abr/2025
const tendencia = await executar(c.q_tendencia(ctx({ ano: 2025, mes_inicio: 3, mes_fim: 4 })));
conferir("q_tendencia 2025 ignora o intervalo de meses", tendencia.length, 12);
conferir(
    "q_tendencia 2025 meses com prejuízo",
    tendencia.filter((l) => l.lucro_liquido < 0).map((l) => l.mes_ano).join(","),
    "Mar/2025,Abr/2025",
);
const todos = await executar(c.q_tendencia(ctx({ ano: null })));
conferir("q_tendencia todos os anos", todos.length, 36);

// Filtragem cruzada: clicar em mar e abr/2025 na tendência, ou no Sudeste no gráfico de regiões
const sel_meses = { ano: 2025, selecao: { origem: "tendencia", campo: "indice_mes", valores: [15, 16] } };
const [kpi_sel] = await executar(c.q_kpis(ctx(sel_meses)));
const ref_mar_abr = ["2025-03", "2025-04"].reduce((s, m) => s + referencias.resultado_mensal.realizado[m].lucro_liquido, 0);
conferir("seleção mar+abr/2025 lucro líquido", kpi_sel.lucro_liquido, ref_mar_abr);
const tendencia_sel = await executar(c.q_tendencia(ctx(sel_meses)));
conferir("seleção de meses não filtra a própria tendência", tendencia_sel.length, 12);
const regioes_sel = await executar(c.q_regioes(ctx({ ano: 2025, selecao: { origem: "tendencia", campo: "indice_mes", valores: [16] } })));
for (const [cod, valor] of Object.entries(referencias.lucro_liquido_por_regiao["2025-04"])) {
    conferir(`seleção abr/2025 filtra regiões ${cod}`, regioes_sel.find((l) => l.cod_regiao === cod)?.lucro_liquido, valor);
}
const links_sel = await executar(c.q_sankey_links(ctx({ ano: 2025, selecao: { origem: "tendencia", campo: "indice_mes", valores: [15] } })));
for (const [cod_link, valor] of Object.entries(referencias.sankey_realizado["2025-03"].todas)) {
    conferir(`seleção mar/2025 sankey ${cod_link}`, links_sel.find((l) => `${l.cod_no_origem}__${l.cod_no_destino}` === cod_link)?.valor, valor);
}
const sel_sudeste = { ano: 2025, mes_inicio: 4, mes_fim: 4, selecao: { origem: "regioes", campo: "cod_regiao", valores: ["sudeste"] } };
const [kpi_sudeste] = await executar(c.q_kpis(ctx(sel_sudeste)));
conferir("seleção Sudeste abr/2025 lucro líquido", kpi_sudeste.lucro_liquido, referencias.lucro_liquido_por_regiao["2025-04"].sudeste);
const regioes_sudeste = await executar(c.q_regioes(ctx(sel_sudeste)));
conferir("seleção de regiões não filtra o próprio gráfico", regioes_sudeste.filter((l) => l.cod_regiao).length, 5);

// DRE: contas e subtotais fecham com o lucro líquido
const dre = await executar(c.q_dre(ctx({ ano: 2024 })));
conferir("q_dre 2024 linhas", dre.length, 19);
conferir("q_dre 2024 soma realizado", dre.reduce((s, l) => s + l.realizado, 0), referencias.dre_anual.realizado["2024"].lucro_liquido);
const subtotais = await executar(c.q_dre_subtotais(ctx({ ano: 2024 })));
const ll = subtotais.find((l) => l.cod_no === "lucro_liquido");
conferir("q_dre_subtotais 2024 lucro líquido realizado", ll?.realizado, referencias.dre_anual.realizado["2024"].lucro_liquido);
conferir("q_dre_subtotais 2024 lucro líquido orçado", ll?.orcado, referencias.dre_anual.orcado["2024"].lucro_liquido);
conferir("q_dre_subtotais rótulo", ll?.nome_no, "Lucro Líquido");

// Detalhe de nó, operacional, nós e carga: rodam sem erro e com forma esperada
const nos = await executar(c.q_sankey_nos);
conferir("q_sankey_nos", nos.length, 30);
const cod_nos = nos.map((n) => n.cod_no);
const detalhe = await executar(c.q_detalhe_no(ctx({ ano: 2025 }), "despesas_nao_recorrentes", cod_nos, false));
conferir("q_detalhe_no despesas_nao_recorrentes 2025 meses", detalhe.length, 12);
const detalhe_hw = await executar(c.q_detalhe_no(ctx({ ano: 2024 }), "hardware", cod_nos, true));
conferir("q_detalhe_no hardware (saídas) soma", detalhe_hw.reduce((s, l) => s + l.valor, 0) > 0, true);
const [operacional] = await executar(c.q_operacional(ctx({ ano: 2026 })));
conferir("q_operacional clientes_ativos > 0", operacional?.clientes_ativos > 0, true);
const [carga] = await executar(c.q_carga);
conferir("q_carga data_ultima_carga", typeof carga?.data_ultima_carga, "string");

await servidor.close();

console.log(`${verificacoes} verificações, ${falhas.length} falhas`);
for (const falha of falhas) console.log(`  FALHA ${falha}`);
process.exit(falhas.length === 0 ? 0 : 1);
