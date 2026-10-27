// Fábrica do gráfico do painel de detalhe: evolução mensal de um nó do Sankey
// (barras) contra o mesmo mês do ano anterior (linha tracejada). Também é fonte da
// filtragem cruzada por mês: as barras fora da seleção ficam esmaecidas.

import type { VisualizationSpec } from "@microsoft/fabric-visuals";

import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { opacidade_esmaecida, paletas, type PaletaGraficos } from "@/tema/tema_graficos";
import { meses_selecionados } from "../construtor_filtros";
import { conexao_modelo, q_detalhe_no, type ContextoConsulta } from "../consultas_dax";
import { formatos } from "../formatacao";

export interface ParametrosDetalheNo extends ContextoConsulta {
    cod_no: string;
    nos_validos: string[];
    pelas_saidas: boolean;
    cor: string;
}

export function visual_detalhe_no(params: ParametrosDetalheNo, paleta: PaletaGraficos = paletas.escuro) {
    return {
        connection: conexao_modelo,
        query: q_detalhe_no(params, params.cod_no, params.nos_validos, params.pelas_saidas),
        columnMetadata: metadados_detalhe_no,
        vegaLiteSpec: montar_spec_detalhe_no(paleta, params.cor, meses_selecionados(params.filtros, params.dominio)),
    };
}

export const metadados_detalhe_no: ColumnMetadataMap = {
    "dim_calendario[indice_mes]": { name: "indice_mes", displayName: "Índice do mês" },
    "dim_calendario[mes_ano]": { name: "mes_ano", displayName: "Mês" },
    "[valor]": { name: "valor", displayName: "Valor", format: formatos.moeda },
    "[valor_aa]": { name: "valor_aa", displayName: "Ano anterior", format: formatos.moeda },
    "[lucro_liquido]": { name: "lucro_liquido", displayName: "Lucro líquido do mês", format: formatos.moeda },
};

/** `selecionados` = indice_mes da seleção cruzada, `null` = nenhum. */
export function montar_spec_detalhe_no(
    paleta: PaletaGraficos,
    cor: string,
    selecionados: number[] | null,
): VisualizationSpec {
    const dica = [
        { field: "mes_ano", type: "nominal" },
        { field: "valor", type: "quantitative" },
        { field: "valor_aa", type: "quantitative" },
        { field: "lucro_liquido", type: "quantitative" },
    ];
    const em_destaque = selecionados ? `indexof(${JSON.stringify(selecionados)}, datum.indice_mes) >= 0` : "true";
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
                mark: { type: "bar", color: cor, cursor: "pointer" },
                encoding: {
                    y: { field: "valor", type: "quantitative", title: null, axis: { tickCount: 4 } },
                    // contorno vermelho nos meses em que a empresa fechou com prejuízo
                    stroke: {
                        condition: { test: "datum.lucro_liquido < 0", value: paleta.prejuizo },
                        value: null,
                    },
                    strokeWidth: { value: 2 },
                    opacity: { condition: { test: em_destaque, value: 1 }, value: opacidade_esmaecida },
                    tooltip: dica,
                },
            },
            {
                mark: {
                    type: "line",
                    interpolate: "monotone",
                    color: paleta.total,
                    strokeDash: [4, 4],
                    strokeWidth: 1.5,
                    point: { filled: true, size: 24, color: paleta.total },
                },
                encoding: {
                    y: { field: "valor_aa", type: "quantitative" },
                    tooltip: dica,
                },
            },
        ],
    } as unknown as VisualizationSpec;
}
