import { describe, expect, it } from "vitest";

import { abreviar_moeda, formatar, formatos, percentual } from "./formatacao";

describe("formatar", () => {
    it("aplica as format strings do modelo em pt-BR", () => {
        expect(formatar(1234567.89, formatos.moeda)).toBe("R$ 1.234.568");
        expect(formatar(-2590000.5, formatos.moeda)).toBe("(R$ 2.590.001)");
        expect(formatar(0.117246, formatos.percentual)).toBe("11,7%");
        expect(formatar(0.0523, formatos.variacao_pct)).toBe("+5,2%");
        expect(formatar(-0.0523, formatos.variacao_pct)).toBe("-5,2%");
        expect(formatar(12345, formatos.inteiro)).toBe("12.345");
        expect(formatar(0.0123, formatos.churn)).toBe("1,23%");
    });

    it("mantém o sufixo p.p. com o ponto literal", () => {
        expect(formatar(2.54, formatos.variacao_pp)).toBe("+2,5 p.p.");
        expect(formatar(-3.21, formatos.variacao_pp)).toBe("-3,2 p.p.");
    });

    it("formata a data da carga sem mexer no fuso", () => {
        expect(formatar("2026-10-23T00:25:11.593", formatos.data_hora)).toBe("23/10/2026 00:25");
    });

    it("valor vazio vira travessão", () => {
        expect(formatar(null, formatos.moeda)).toBe("–");
        expect(formatar(undefined, formatos.percentual)).toBe("–");
    });
});

describe("abreviar_moeda e percentual", () => {
    it("abrevia em mi, bi e mil", () => {
        expect(abreviar_moeda(175_717_045.7)).toBe("R$ 175,7 mi");
        expect(abreviar_moeda(1_250_000_000)).toBe("R$ 1,3 bi");
        expect(abreviar_moeda(20_950.98)).toBe("R$ 21,0 mil");
        expect(abreviar_moeda(-2_594_767)).toBe("−R$ 2,6 mi");
    });

    it("percentual com uma casa", () => {
        expect(percentual(0.117246)).toBe("11,7%");
    });
});
