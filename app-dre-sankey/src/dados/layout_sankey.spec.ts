import { describe, expect, it } from "vitest";

import { linhas_da_tabela, numero, texto } from "./cliente_modelo";
import { calcular_layout, type LinkSankeyEntrada, type NoSankeyEntrada } from "./layout_sankey";
import tabela_nos from "./fixtures/sankey_nos.json";
import tabela_mar from "./fixtures/sankey_links_2025_03.json";
import tabela_abr from "./fixtures/sankey_links_2025_04.json";
import tabela_ano from "./fixtures/sankey_links_2025.json";

const nos: NoSankeyEntrada[] = linhas_da_tabela(tabela_nos).map((l) => ({
    cod_no: texto(l, "cod_no"),
    nome_no: texto(l, "nome_no"),
    tipo_no: texto(l, "tipo_no"),
    coluna_sankey: numero(l, "coluna_sankey") ?? 0,
    cor_hex: texto(l, "cor_hex"),
}));

function links(tabela: typeof tabela_mar): LinkSankeyEntrada[] {
    return linhas_da_tabela(tabela).map((l) => ({
        cod_no_origem: texto(l, "cod_no_origem"),
        cod_no_destino: texto(l, "cod_no_destino"),
        tipo_link: texto(l, "tipo_link"),
        valor: numero(l, "valor") ?? 0,
        valor_aa: numero(l, "valor_aa"),
        var_aa_pct: numero(l, "var_aa_pct"),
    }));
}

const opcoes = { largura: 1000, altura: 500, largura_no: 14, espaco_vertical: 14 };

describe("calcular_layout", () => {
    it.each([
        ["mar/2025", tabela_mar],
        ["abr/2025", tabela_abr],
        ["2025", tabela_ano],
    ])("fecha cada nó com entrada e saída (%s)", (_, tabela) => {
        const layout = calcular_layout(nos, links(tabela), opcoes);
        for (const no of layout.nos) {
            if (no.entradas.length === 0 || no.saidas.length === 0) continue;
            const entrada = no.entradas.reduce((s, l) => s + l.valor, 0);
            const saida = no.saidas.reduce((s, l) => s + l.valor, 0);
            expect(Math.abs(entrada - saida), no.cod_no).toBeLessThan(0.05);
        }
    });

    it("posiciona o prejuízo de mar/2025 à esquerda da primeira camada que ele financia", () => {
        const layout = calcular_layout(nos, links(tabela_mar), opcoes);
        const prejuizo = layout.nos.find((no) => no.cod_no === "prejuizo_liquido");
        expect(prejuizo?.coluna).toBe(3); // financia despesas operacionais (coluna 4)
        expect(prejuizo?.valor).toBeCloseTo(2_071_798.75 + 388_600.04 + 134_368.48, 1);
        expect(layout.nos.map((no) => no.cod_no)).not.toContain("ebitda");
        expect(layout.nos.map((no) => no.cod_no)).not.toContain("lucro_liquido");
    });

    it("posiciona o prejuízo de abr/2025 na coluna do EBITDA", () => {
        const layout = calcular_layout(nos, links(tabela_abr), opcoes);
        expect(layout.nos.find((no) => no.cod_no === "prejuizo_liquido")?.coluna).toBe(4);
    });

    it("não tem nó de prejuízo no ano de 2025", () => {
        const layout = calcular_layout(nos, links(tabela_ano), opcoes);
        expect(layout.nos.map((no) => no.cod_no)).not.toContain("prejuizo_liquido");
        expect(layout.nos.find((no) => no.cod_no === "lucro_liquido")?.valor).toBeCloseTo(13_088_163.15, 1);
    });

    it("mantém as colunas da dimensão, cabe na área e não sobrepõe nós", () => {
        const layout = calcular_layout(nos, links(tabela_mar), opcoes);
        for (const no of layout.nos) {
            if (no.tipo_no !== "prejuizo") expect(no.coluna).toBe(no.coluna_sankey);
            expect(no.y0).toBeGreaterThanOrEqual(-0.001);
            expect(no.y1).toBeLessThanOrEqual(opcoes.altura + 0.001);
            expect(no.x1).toBeLessThanOrEqual(opcoes.largura + 0.001);
        }
        const colunas = new Set(layout.nos.map((no) => no.coluna));
        for (const coluna of colunas) {
            const grupo = layout.nos.filter((no) => no.coluna === coluna);
            const ordenados = [...grupo].sort((a, b) => a.y0 - b.y0);
            for (let i = 1; i < ordenados.length; i++) {
                expect(ordenados[i].y0).toBeGreaterThanOrEqual(ordenados[i - 1].y1);
            }
        }
    });

    it("empilha as faixas de cada nó sem ultrapassar a altura do nó", () => {
        const layout = calcular_layout(nos, links(tabela_ano), opcoes);
        for (const link of layout.links) {
            expect(link.y0 - link.width / 2).toBeGreaterThanOrEqual(link.source.y0 - 0.001);
            expect(link.y0 + link.width / 2).toBeLessThanOrEqual(link.source.y1 + 0.001);
            expect(link.y1 - link.width / 2).toBeGreaterThanOrEqual(link.target.y0 - 0.001);
            expect(link.y1 + link.width / 2).toBeLessThanOrEqual(link.target.y1 + 0.001);
        }
    });

    it("ignora links sem valor e devolve layout vazio sem links", () => {
        expect(calcular_layout(nos, [], opcoes).nos).toHaveLength(0);
        const zerado = links(tabela_ano).map((l) => ({ ...l, valor: 0 }));
        expect(calcular_layout(nos, zerado, opcoes).links).toHaveLength(0);
    });
});
