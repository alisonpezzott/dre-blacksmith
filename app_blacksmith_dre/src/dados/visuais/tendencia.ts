// Fábrica do gráfico de tendência: receita líquida (área), lucro líquido (linha)
// e margem líquida (eixo secundário), com os meses de prejuízo marcados.
// Fonte da filtragem cruzada por mês: uma faixa transparente por mês, por cima das
// séries, recebe o clique (linhas e áreas não identificam o mês clicado).

import type { VisualizationSpec } from "@microsoft/fabric-visuals";

import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { paletas, type PaletaGraficos } from "@/tema/tema_graficos";
import { meses_do_intervalo, meses_selecionados } from "../construtor_filtros";
import { conexao_modelo, q_tendencia, type ContextoConsulta } from "../consultas_dax";
import { formatos } from "../formatacao";

export function visual_tendencia(ctx: ContextoConsulta, paleta: PaletaGraficos = paletas.escuro) {
    return {
        connection: conexao_modelo,
        query: q_tendencia(ctx),
        columnMetadata: metadados_tendencia,
        vegaLiteSpec: montar_spec_tendencia(
            paleta,
            meses_do_intervalo(ctx.filtros),
            meses_selecionados(ctx.filtros, ctx.dominio),
        ),
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

/** Teste Vega: o mês (1 a 12) do ponto está na lista. */
function mes_em(meses: number[]): string {
    return `indexof(${JSON.stringify(meses)}, ((datum.indice_mes - 1) % 12) + 1) >= 0`;
}

/**
 * `intervalo` = meses (1 a 12) do filtro da barra, `null` = ano inteiro;
 * `selecionados` = indice_mes clicados no gráfico, `null` = nenhum.
 */
export function montar_spec_tendencia(
    paleta: PaletaGraficos,
    intervalo: number[] | null,
    selecionados: number[] | null,
): VisualizationSpec {
    const selecionado = selecionados
        ? `indexof(${JSON.stringify(selecionados)}, datum.indice_mes) >= 0`
        : "false";
    // sem seleção, a faixa marca o intervalo de meses da barra (quando ele não é o ano inteiro)
    const faixa = selecionados
        ? { condition: { test: selecionado, value: 1 }, value: 0 }
        : intervalo
            ? { condition: { test: mes_em(intervalo), value: 0.6 }, value: 0 }
            : { value: 0 };
    const so_selecionados = [{ filter: selecionado }];

    return {
        $schema: "https://vega.github.io/schema/vega-lite/v6.json",
        width: "container",
        height: "container",
        encoding: { x: eixo_x },
        layer: [
            {
                // faixa de fundo dos meses selecionados
                mark: { type: "bar", width: { band: 1 }, color: paleta.selecionado },
                encoding: { opacity: faixa },
            },
            {
                encoding: {
                    y: { type: "quantitative", title: null, axis: { tickCount: 5 } },
                },
                layer: [
                    {
                        mark: {
                            type: "area",
                            interpolate: "monotone",
                            color: paleta.receita,
                            fillOpacity: 0.16,
                            line: { color: paleta.receita, strokeWidth: 1.5 },
                        },
                        encoding: { y: { field: "receita_liquida" } },
                    },
                    {
                        mark: { type: "line", interpolate: "monotone", color: paleta.lucro, strokeWidth: 2 },
                        encoding: { y: { field: "lucro_liquido" } },
                    },
                    {
                        transform: so_selecionados,
                        mark: { type: "point", filled: true, size: 48, color: paleta.receita },
                        encoding: { y: { field: "receita_liquida" } },
                    },
                    {
                        transform: so_selecionados,
                        mark: { type: "point", filled: true, size: 48, color: paleta.lucro },
                        encoding: { y: { field: "lucro_liquido" } },
                    },
                    {
                        transform: so_prejuizo,
                        mark: {
                            type: "point",
                            filled: true,
                            size: 80,
                            color: paleta.prejuizo,
                            stroke: paleta.superficie,
                            strokeWidth: 1.5,
                        },
                        encoding: { y: { field: "lucro_liquido" } },
                    },
                    {
                        transform: so_prejuizo,
                        mark: {
                            type: "text",
                            text: "prejuízo",
                            dy: 16,
                            fontSize: 11,
                            color: paleta.prejuizo_texto,
                        },
                        encoding: { y: { field: "lucro_liquido" } },
                    },
                ],
            },
            {
                mark: {
                    type: "line",
                    interpolate: "monotone",
                    color: paleta.total,
                    strokeDash: [4, 4],
                    strokeWidth: 1.5,
                },
                encoding: {
                    y: {
                        field: "margem_liquida",
                        type: "quantitative",
                        title: null,
                        axis: { orient: "right", grid: false, tickCount: 5 },
                    },
                },
            },
            {
                // faixa transparente por cima: recebe o clique e a dica de cada mês
                mark: { type: "bar", width: { band: 1 }, color: paleta.selecionado, opacity: 0, cursor: "pointer" },
                encoding: { tooltip: dica },
            },
        ],
        resolve: { scale: { y: "independent" } },
    } as unknown as VisualizationSpec;
}
