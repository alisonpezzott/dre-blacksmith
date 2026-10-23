// Fábrica do gráfico de regiões: barras horizontais de receita líquida com a margem
// líquida em rótulo. As regiões fora do filtro ficam esmaecidas.

import type { VisualizationSpec } from "@microsoft/fabric-visuals";

import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { paleta_graficos } from "@/tema/tema_graficos";
import { regioes_filtradas } from "../construtor_filtros";
import { conexao_modelo, q_regioes, type ContextoConsulta } from "../consultas_dax";
import { formatos } from "../formatacao";

export function visual_regioes(ctx: ContextoConsulta) {
    const selecionadas = regioes_filtradas(ctx.filtros, ctx.dominio);
    return {
        connection: conexao_modelo,
        query: q_regioes(ctx),
        columnMetadata: metadados_regioes,
        vegaLiteSpec: montar_spec_regioes(selecionadas),
    };
}

export const metadados_regioes: ColumnMetadataMap = {
    "dim_regiao[cod_regiao]": { name: "cod_regiao", displayName: "Código da região" },
    "dim_regiao[nome_regiao]": { name: "nome_regiao", displayName: "Região" },
    "[receita_liquida]": { name: "receita_liquida", displayName: "Receita líquida", format: formatos.moeda },
    "[margem_liquida]": { name: "margem_liquida", displayName: "Margem líquida", format: formatos.percentual },
    "[lucro_liquido]": { name: "lucro_liquido", displayName: "Lucro líquido", format: formatos.moeda },
};

/** `selecionadas` = null quando todas as regiões estão no filtro. */
export function montar_spec_regioes(selecionadas: string[] | null): VisualizationSpec {
    const no_filtro = selecionadas === null
        ? "true"
        : `indexof(${JSON.stringify(selecionadas)}, datum.cod_regiao) >= 0`;
    return {
        $schema: "https://vega.github.io/schema/vega-lite/v6.json",
        width: "container",
        height: "container",
        encoding: {
            y: { field: "nome_regiao", type: "nominal", sort: "-x", title: null },
            x: { field: "receita_liquida", type: "quantitative", title: null, axis: { tickCount: 4 } },
            tooltip: [
                { field: "nome_regiao", type: "nominal" },
                { field: "receita_liquida", type: "quantitative" },
                { field: "lucro_liquido", type: "quantitative" },
                { field: "margem_liquida", type: "quantitative" },
            ],
        },
        layer: [
            {
                mark: { type: "bar", cornerRadiusEnd: 6, height: { band: 0.62 }, color: paleta_graficos.receita },
                encoding: {
                    opacity: { condition: { test: no_filtro, value: 0.9 }, value: 0.25 },
                },
            },
            {
                mark: { type: "text", align: "left", dx: 6, fontWeight: 600 },
                encoding: {
                    text: { field: "margem_liquida", type: "quantitative" },
                    // margem negativa = prejuízo na região (rosa neon é exclusivo de prejuízo)
                    color: {
                        condition: { test: "datum.margem_liquida < 0", value: paleta_graficos.prejuizo },
                        value: paleta_graficos.lucro,
                    },
                },
            },
        ],
    } as unknown as VisualizationSpec;
}
