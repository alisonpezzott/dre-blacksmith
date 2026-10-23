// Linhas da tabela DRE: contas e subtotais do modelo intercalados.

import type { DataTable } from "@microsoft/fabric-visuals-core";

import { numero, texto, type Linha } from "./cliente_modelo";
import { formatos } from "./formatacao";

const subtotais_destacados = new Set(["lucro_bruto", "ebitda", "ebit_lucro_operacional", "lair", "lucro_liquido"]);

/** Intercala as linhas de subtotal depois da última conta do bloco (apos_ordem_dre). */
export function montar_linhas_dre(contas: Linha[], subtotais: Linha[]): DataTable {
    const itens = [
        ...contas.map((l) => ({
            ordem: numero(l, "ordem_dre") ?? 0,
            linha: ["conta", texto(l, "nome_conta"), numero(l, "realizado"), numero(l, "orcado"), numero(l, "var_pct")],
        })),
        ...subtotais.map((l) => {
            const cod = texto(l, "cod_no");
            return {
                ordem: (numero(l, "apos_ordem_dre") ?? 0) + 0.5,
                linha: [
                    subtotais_destacados.has(cod) ? "destaque" : "subtotal",
                    texto(l, "nome_no"),
                    numero(l, "realizado"),
                    numero(l, "orcado"),
                    numero(l, "var_pct"),
                ],
            };
        }),
    ].sort((a, b) => a.ordem - b.ordem);

    return {
        columns: [
            { name: "tipo_linha", displayName: "Tipo" },
            { name: "nome", displayName: "Linha da DRE" },
            { name: "realizado", displayName: "Realizado", format: formatos.moeda },
            { name: "orcado", displayName: "Orçado", format: formatos.moeda },
            { name: "var_pct", displayName: "Var. %", format: formatos.variacao_pct },
        ],
        rows: itens.map((item) => item.linha),
    };
}
