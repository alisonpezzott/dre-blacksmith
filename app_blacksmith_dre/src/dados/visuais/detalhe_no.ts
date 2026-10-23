// Fábrica do gráfico do painel de detalhe: evolução mensal de um nó do Sankey
// (barras) contra o mesmo mês do ano anterior (linha tracejada).

import type { VisualizationSpec } from "@microsoft/fabric-visuals";

import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { paleta_graficos } from "@/tema/tema_graficos";
import { conexao_modelo, q_detalhe_no, type ContextoConsulta } from "../consultas_dax";
import { formatos } from "../formatacao";

export interface ParametrosDetalheNo extends ContextoConsulta {
    cod_no: string;
    nos_validos: string[];
    pelas_saidas: boolean;
    cor: string;
}

export function visual_detalhe_no(params: ParametrosDetalheNo) {
    return {
        connection: conexao_modelo,
        query: q_detalhe_no(params, params.cod_no, params.nos_validos, params.pelas_saidas),
        columnMetadata: metadados_detalhe_no,
        vegaLiteSpec: montar_spec_detalhe_no(params.cor),
    };
}

export const metadados_detalhe_no: ColumnMetadataMap = {
    "dim_calendario[indice_mes]": { name: "indice_mes", displayName: "Índice do mês" },
    "dim_calendario[mes_ano]": { name: "mes_ano", displayName: "Mês" },
    "[valor]": { name: "valor", displayName: "Valor", format: formatos.moeda },
    "[valor_aa]": { name: "valor_aa", displayName: "Ano anterior", format: formatos.moeda },
    "[lucro_liquido]": { name: "lucro_liquido", displayName: "Lucro líquido do mês", format: formatos.moeda },
};

export function montar_spec_detalhe_no(cor: string): VisualizationSpec {
    const dica = [
        { field: "mes_ano", type: "nominal" },
        { field: "valor", type: "quantitative" },
        { field: "valor_aa", type: "quantitative" },
        { field: "lucro_liquido", type: "quantitative" },
    ];
    return {
        $schema: "https://vega.github.io/schema/vega-lite/v6.json",
        width: "container",
        height: "container",
        encoding: {
            x: {
                field: "mes_ano",
                type: "ordinal",
                sort: { field: "indice_mes", op: "min" },
                title: null,
                axis: { labelAngle: -40, labelOverlap: "greedy" },
            },
        },
        layer: [
            {
                mark: { type: "bar", cornerRadiusTopLeft: 4, cornerRadiusTopRight: 4, color: cor },
                encoding: {
                    y: { field: "valor", type: "quantitative", title: null, axis: { tickCount: 4 } },
                    // contorno rosa nos meses em que a empresa fechou com prejuízo
                    stroke: {
                        condition: { test: "datum.lucro_liquido < 0", value: paleta_graficos.prejuizo },
                        value: null,
                    },
                    strokeWidth: { value: 2 },
                    opacity: { value: 0.85 },
                    tooltip: dica,
                },
            },
            {
                mark: {
                    type: "line",
                    interpolate: "monotone",
                    color: paleta_graficos.total,
                    strokeDash: [6, 4],
                    strokeWidth: 2,
                    point: { filled: true, size: 28, color: paleta_graficos.total },
                },
                encoding: {
                    y: { field: "valor_aa", type: "quantitative" },
                    tooltip: dica,
                },
            },
        ],
    } as unknown as VisualizationSpec;
}
