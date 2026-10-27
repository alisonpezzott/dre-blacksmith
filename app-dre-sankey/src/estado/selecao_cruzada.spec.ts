import { describe, expect, it } from "vitest";

import { valores_da_interacao } from "./selecao_cruzada";

describe("valores_da_interacao", () => {
    it("clear vira null", () => {
        expect(valores_da_interacao([{ action: "clear" }], "indice_mes")).toBeNull();
    });

    it("junta os valores do campo de todas as seleções (Ctrl+clique), sem repetir", () => {
        const ponto = (indice_mes: number) => ({
            predicates: [
                { type: "set" as const, name: "indice_mes", values: [indice_mes] },
                { type: "set" as const, name: "mes_ano", values: [`m${indice_mes}`] },
            ],
        });
        expect(
            valores_da_interacao([{ action: "select", selections: [ponto(15), ponto(16), ponto(15)] }], "indice_mes"),
        ).toEqual([15, 16]);
    });

    it("ponto sem o campo devolve lista vazia", () => {
        expect(
            valores_da_interacao(
                [{ action: "select", selections: [{ predicates: [{ type: "set", name: "outro", values: [1] }] }] }],
                "cod_regiao",
            ),
        ).toEqual([]);
    });
});
