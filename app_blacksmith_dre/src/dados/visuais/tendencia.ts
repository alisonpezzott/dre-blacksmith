// Fábrica do gráfico de tendência: receita líquida (área), lucro líquido (linha)
// e margem líquida (eixo secundário), com os meses de prejuízo marcados.

import type { VisualizationSpec } from "@microsoft/fabric-visuals";

import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { paleta_graficos } from "@/tema/tema_graficos";
import { conexao_modelo, q_tendencia, type ContextoConsulta } from "../consultas_dax";
import { formatos } from "../formatacao";

export function visual_tendencia(ctx: ContextoConsulta) {
    return {
        connection: conexao_modelo,
        query: q_tendencia(ctx),
        columnMetadata: metadados_tendencia,
        vegaLiteSpec: spec_tendencia,
    };
}

export const metadados_tendencia: ColumnMetadataMap = {
    "dim_calendario[indice_mes]": { name: "indice_mes", displayName: "Índice do mês" },
    "dim_calendario[mes_ano]": { name: "mes_ano", displayName: "Mês" },
    "[receita_liquida]": { name: "receita_liquida", displayName: "Receita líquida", format: formatos.moeda },
    "[lucro_bruto]": { name: "lucro_bruto", displayName: "Lucro bruto", format: formatos.moeda },
    "[ebitda]": { name: "ebitda", displayName: "EBITDA", format: formatos.moeda },
    "[lucro_liquido]": { name: "lucro_liquido", displayName: "Lucro líquido", format: formatos.moeda },
    "[margem_liquida]": { name: "margem_liquida", displayName: "Margem líquida", format: formatos.percentual },
    "[var_lucro_liquido_orcado_pct]": {
        name: "var_lucro_liquido_orcado_pct",
        displayName: "Lucro líquido vs orçado",
        format: formatos.variacao_pct,
    },
};

const eixo_x = {
    field: "mes_ano",
    type: "ordinal",
    sort: { field: "indice_mes", op: "min" },
    title: null,
    axis: { labelAngle: -40, labelOverlap: "greedy" },
} as const;

const dica = [
    { field: "mes_ano", type: "nominal" },
    { field: "receita_liquida", type: "quantitative" },
    { field: "lucro_liquido", type: "quantitative" },
    { field: "margem_liquida", type: "quantitative" },
] as const;

const so_prejuizo = [{ filter: "datum.lucro_liquido < 0" }];

export const spec_tendencia = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width: "container",
    height: "container",
    encoding: { x: eixo_x },
    layer: [
        {
            encoding: {
                y: { type: "quantitative", title: null, axis: { tickCount: 5 } },
            },
            layer: [
                {
                    mark: {
                        type: "area",
                        interpolate: "monotone",
                        color: {
                            gradient: "linear",
                            x1: 1, y1: 1, x2: 1, y2: 0,
                            stops: [
                                { offset: 0, color: "rgba(0, 229, 255, 0.02)" },
                                { offset: 1, color: "rgba(0, 229, 255, 0.45)" },
                            ],
                        },
                        line: { color: paleta_graficos.receita, strokeWidth: 2 },
                    },
                    encoding: { y: { field: "receita_liquida" }, tooltip: dica },
                },
                {
                    mark: { type: "line", interpolate: "monotone", color: paleta_graficos.lucro, strokeWidth: 2.5 },
                    encoding: { y: { field: "lucro_liquido" }, tooltip: dica },
                },
                {
                    transform: so_prejuizo,
                    mark: {
                        type: "point",
                        filled: true,
                        size: 110,
                        color: paleta_graficos.prejuizo,
                        stroke: "#05070F",
                        strokeWidth: 1.5,
                    },
                    encoding: { y: { field: "lucro_liquido" }, tooltip: dica },
                },
                {
                    transform: so_prejuizo,
                    mark: {
                        type: "text",
                        text: "prejuízo",
                        dy: 16,
                        fontWeight: 600,
                        fontSize: 11,
                        color: paleta_graficos.prejuizo,
                    },
                    encoding: { y: { field: "lucro_liquido" } },
                },
            ],
        },
        {
            mark: {
                type: "line",
                interpolate: "monotone",
                color: paleta_graficos.total,
                strokeDash: [6, 4],
                strokeWidth: 2,
            },
            encoding: {
                y: {
                    field: "margem_liquida",
                    type: "quantitative",
                    title: null,
                    axis: { orient: "right", grid: false, tickCount: 5 },
                },
                tooltip: dica,
            },
        },
    ],
    resolve: { scale: { y: "independent" } },
} as unknown as VisualizationSpec;
