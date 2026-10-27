// Traduz os eventos onInteraction dos visuais do template (VegaVisual, DataGrid) nos
// valores de um campo, para a filtragem cruzada.

import type { InteractionEvent } from "@microsoft/fabric-visuals-core";

/**
 * Capacidades dos VegaVisual que são fonte de seleção: o esmaecimento vem do estado do
 * painel (spec), não do destaque interno do visual, que se perderia a cada nova consulta;
 * a faixa por mês da tendência substitui a mira de linha do template.
 */
export const capacidades_selecao = {
    disableSelfHighlight: true,
    disableLineChartCrosshairTooltip: true,
} as const;

/**
 * Valores do `campo` nos pontos selecionados pelo último evento, ou `null` quando o evento
 * limpa a seleção (clique no mesmo ponto ou no fundo do visual). Os predicados trazem todos
 * os campos do ponto clicado; só o campo pedido interessa.
 */
export function valores_da_interacao(eventos: InteractionEvent[], campo: string): unknown[] | null {
    const ultimo = eventos[eventos.length - 1];
    if (!ultimo || ultimo.action === "clear") return null;
    const valores = ultimo.selections.flatMap((selecao) =>
        selecao.predicates
            .filter((predicado) => predicado.type === "set" && predicado.name === campo)
            .flatMap((predicado) => (predicado.type === "set" ? predicado.values : [])),
    );
    return [...new Set(valores)];
}
