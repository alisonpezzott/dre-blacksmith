import { describe, expect, it } from "vitest";

import { meses_do_intervalo, montar_filtros, regioes_filtradas, type EstadoFiltros } from "./construtor_filtros";

const dominio = { anos: [2024, 2025, 2026], regioes: ["sudeste", "sul", "nordeste", "centro_oeste", "norte"] };
const base: EstadoFiltros = { ano: 2026, mes_inicio: 1, mes_fim: 12, regioes: [], cenario: "realizado" };

describe("montar_filtros", () => {
    it("gera cenário e ano no padrão, sem mês nem região", () => {
        expect(montar_filtros(base, dominio)).toEqual([
            'TREATAS ( { "realizado" }, dim_cenario[cod_cenario] )',
            "TREATAS ( { 2026 }, dim_calendario[ano] )",
        ]);
    });

    it("gera o intervalo de meses e as regiões na ordem do domínio", () => {
        const filtros = montar_filtros(
            { ...base, ano: 2025, mes_inicio: 3, mes_fim: 4, regioes: ["sul", "sudeste"] },
            dominio,
        );
        expect(filtros).toContain("TREATAS ( { 3, 4 }, dim_calendario[mes] )");
        expect(filtros).toContain('TREATAS ( { "sudeste", "sul" }, dim_regiao[cod_regiao] )');
    });

    it("respeita as opções sem_mes, sem_regiao e sem_cenario", () => {
        const estado = { ...base, mes_inicio: 3, mes_fim: 3, regioes: ["sul"] };
        const filtros = montar_filtros(estado, dominio, { sem_mes: true, sem_regiao: true, sem_cenario: true });
        expect(filtros).toEqual(["TREATAS ( { 2026 }, dim_calendario[ano] )"]);
    });

    it("sem filtro de ano quando ano = todos", () => {
        expect(montar_filtros({ ...base, ano: null }, dominio).some((f) => f.includes("[ano]"))).toBe(false);
    });

    it("recusa valores fora do domínio (nada de texto livre na DAX)", () => {
        expect(() => montar_filtros({ ...base, regioes: ['sul" ) , EVALUATE x //'] }, dominio)).toThrow(/domínio/);
        expect(() => montar_filtros({ ...base, ano: 1999 }, dominio)).toThrow(/domínio/);
        expect(() => montar_filtros({ ...base, mes_inicio: 0 }, dominio)).toThrow(/meses/);
        expect(() => montar_filtros({ ...base, cenario: "x" as never }, dominio)).toThrow(/Cenário/);
    });
});

describe("filtragem cruzada", () => {
    const dominio_calendario = { ...dominio, indices_mes: Array.from({ length: 36 }, (_, i) => i + 1) };

    it("seleção de meses vira TREATAS em indice_mes, exceto nos visuais por mês", () => {
        const estado: EstadoFiltros = {
            ...base,
            ano: 2025,
            selecao: { origem: "tendencia", campo: "indice_mes", valores: [16, 15] },
        };
        expect(montar_filtros(estado, dominio_calendario)).toContain("TREATAS ( { 15, 16 }, dim_calendario[indice_mes] )");
        expect(montar_filtros(estado, dominio_calendario, { sem_mes: true }).some((f) => f.includes("indice_mes"))).toBe(false);
    });

    it("seleção de regiões substitui o filtro de regiões, exceto no visual de regiões", () => {
        const estado: EstadoFiltros = {
            ...base,
            regioes: ["sul", "sudeste"],
            selecao: { origem: "regioes", campo: "cod_regiao", valores: ["sul"] },
        };
        expect(montar_filtros(estado, dominio)).toContain('TREATAS ( { "sul" }, dim_regiao[cod_regiao] )');
        expect(montar_filtros(estado, dominio, { sem_regiao: true }).some((f) => f.includes("cod_regiao"))).toBe(false);
    });

    it("recusa seleção fora do domínio ou do filtro de regiões", () => {
        const mes_invalido: EstadoFiltros = { ...base, selecao: { origem: "t", campo: "indice_mes", valores: [99] } };
        expect(() => montar_filtros(mes_invalido, dominio_calendario)).toThrow(/domínio/);
        const sem_calendario: EstadoFiltros = { ...base, selecao: { origem: "t", campo: "indice_mes", valores: [15] } };
        expect(() => montar_filtros(sem_calendario, dominio)).toThrow(/domínio/);
        const injecao: EstadoFiltros = { ...base, selecao: { origem: "r", campo: "cod_regiao", valores: ['sul" ) //'] } };
        expect(() => montar_filtros(injecao, dominio)).toThrow(/domínio/);
        const fora: EstadoFiltros = {
            ...base,
            regioes: ["sul"],
            selecao: { origem: "r", campo: "cod_regiao", valores: ["norte"] },
        };
        expect(() => montar_filtros(fora, dominio)).toThrow(/filtro de regiões/);
    });
});

describe("meses_do_intervalo e regioes_filtradas", () => {
    it("ano inteiro e todas as regiões viram null", () => {
        expect(meses_do_intervalo(base)).toBeNull();
        expect(regioes_filtradas({ ...base, regioes: [...dominio.regioes] }, dominio)).toBeNull();
    });

    it("aceita intervalo invertido", () => {
        expect(meses_do_intervalo({ ...base, mes_inicio: 5, mes_fim: 3 })).toEqual([3, 4, 5]);
    });
});
