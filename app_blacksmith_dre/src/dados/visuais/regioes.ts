// Fábrica do gráfico de regiões: barras horizontais de receita líquida com a margem
// líquida em rótulo. Fonte da filtragem cruzada por região: as regiões fora do filtro
// da barra ou fora da seleção ficam esmaecidas.

import type { VisualizationSpec } from "@microsoft/fabric-visuals";

import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { opacidade_esmaecida, paletas, type PaletaGraficos } from "@/tema/tema_graficos";
import { regioes_filtradas, regioes_selecionadas } from "../construtor_filtros";
import { conexao_modelo, q_regioes, type ContextoConsulta } from "../consultas_dax";
import { formatos } from "../formatacao";

export function visual_regioes(ctx: ContextoConsulta, paleta: PaletaGraficos = paletas.escuro) {
    return {
        connection: conexao_modelo,
        query: q_regioes(ctx),
        columnMetadata: metadados_regioes,
        vegaLiteSpec: montar_spec_regioes(
            paleta,
            regioes_filtradas(ctx.filtros, ctx.dominio),
            regioes_selecionadas(ctx.filtros, ctx.dominio),
        ),
    };
}

export const metadados_regioes: ColumnMetadataMap = {
    "dim_regiao[cod_regiao]": { name: "cod_regiao", displayName: "Código da região" },
    "dim_regiao[nome_regiao]": { name: "nome_regiao", displayName: "Região" },
    "[receita_liquida]": { name: "receita_liquida", displayName: "Receita líquida", format: formatos.moeda },
    "[margem_liquida]": { name: "margem_liquida", displayName: "Margem líquida", format: formatos.percentual },
    "[lucro_liquido]": { name: "lucro_liquido", displayName: "Lucro líquido", format: formatos.moeda },
};

/** Teste Vega de pertença: `null` = todas as regiões. */
function contem(regioes: string[] | null): string {
    return regioes === null ? "true" : `indexof(${JSON.stringify(regioes)}, datum.cod_regiao) >= 0`;
}

/**
 * `no_filtro` = regiões do filtro da barra (`null` = todas);
 * `selecionadas` = regiões clicadas no próprio gráfico (`null` = nenhuma).
 */
export function montar_spec_regioes(
    paleta: PaletaGraficos,
    no_filtro: string[] | null,
    selecionadas: string[] | null,
): VisualizationSpec {
    const em_destaque = `(${contem(no_filtro)}) && (${contem(selecionadas)})`;
    return {
        $schema: "https://vega.github.io/schema/vega-lite/v6.json",
        width: "container",
        height: "container",
        encoding: {
            y: { field: "nome_regiao", type: "nominal", sort: "-x", title: null },
            x: { field: "receita_liquida", type: "quantitative", title: null, axis: { tickCount: 4 } },
            opacity: { condition: { test: em_destaque, value: 1 }, value: opacidade_esmaecida },
            tooltip: [
                { field: "nome_regiao", type: "nominal" },
                { field: "receita_liquida", type: "quantitative" },
                { field: "lucro_liquido", type: "quantitative" },
                { field: "margem_liquida", type: "quantitative" },
            ],
        },
        layer: [
            {
                mark: { type: "bar", height: { band: 0.6 }, color: paleta.receita, cursor: "pointer" },
            },
            {
                mark: { type: "text", align: "left", dx: 6, cursor: "pointer" },
                encoding: {
                    text: { field: "margem_liquida", type: "quantitative" },
                    // margem negativa = prejuízo na região (vermelho é exclusivo de prejuízo)
                    color: {
                        condition: { test: "datum.margem_liquida < 0", value: paleta.prejuizo_texto },
                        value: paleta.texto_suave,
                    },
                },
            },
        ],
    } as unknown as VisualizationSpec;
}
