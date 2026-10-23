import { describe, expect, it } from "vitest";

import { linhas_da_tabela, nome_coluna } from "./cliente_modelo";
import { montar_linhas_dre } from "./linhas_dre";
import tabela_contas from "./fixtures/dre_2025_03.json";
import tabela_subtotais from "./fixtures/dre_subtotais_2025_03.json";

describe("nome_coluna", () => {
    it("tira tabela e colchetes do nome da coluna da DAX", () => {
        expect(nome_coluna("dim_calendario[mes_ano]")).toBe("mes_ano");
        expect(nome_coluna("[receita_liquida]")).toBe("receita_liquida");
        expect(nome_coluna("sem_colchete")).toBe("sem_colchete");
    });
});

describe("montar_linhas_dre", () => {
    const dados = montar_linhas_dre(linhas_da_tabela(tabela_contas), linhas_da_tabela(tabela_subtotais));
    const nomes = dados.rows.map((linha) => linha[1]);

    it("intercala as 19 contas com os 7 subtotais", () => {
        expect(dados.rows).toHaveLength(26);
        expect(nomes.indexOf("Receita Bruta")).toBe(nomes.indexOf("Suporte & Manutenção") + 1);
        expect(nomes.indexOf("Lucro Bruto")).toBe(nomes.indexOf("Royalties & Licenças de Terceiros") + 1);
        expect(nomes.indexOf("EBITDA")).toBe(nomes.indexOf("Despesas Não Recorrentes") + 1);
        expect(nomes[nomes.length - 1]).toBe("Lucro Líquido");
    });

    it("destaca lucro bruto, EBITDA, EBIT, LAIR e lucro líquido", () => {
        const destaques = dados.rows.filter((linha) => linha[0] === "destaque").map((linha) => linha[1]);
        expect(destaques).toEqual(["Lucro Bruto", "EBITDA", "EBIT (Lucro Operacional)", "LAIR", "Lucro Líquido"]);
    });

    it("mar/2025 realizado fecha em prejuízo e o orçado em lucro", () => {
        const lucro = dados.rows.find((linha) => linha[1] === "Lucro Líquido")!;
        expect(lucro[2] as number).toBeLessThan(0);
        expect(lucro[3] as number).toBeGreaterThan(0);
    });
});
