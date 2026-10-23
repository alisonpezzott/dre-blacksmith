// Paleta dos gráficos (seção 9.3 do CLAUDE.md). Semântica fixa:
// ciano = receita; roxo = totais e orçado; laranja = custo e queda; turquesa = lucro e alta; rosa neon = prejuízo.

export const paleta_graficos = {
    receita: "#00E5FF",
    total: "#A855F7",
    custo: "#FF7A1A",
    lucro: "#14F1C6",
    prejuizo: "#FF3DCB",
    serie_extra: ["#00E5FF", "#14F1C6", "#A855F7", "#FF7A1A", "#FF3DCB"],
    grade: "rgba(138, 155, 184, 0.12)",
    eixo: "#55627D",
    texto: "#E6F1FF",
    texto_suave: "#8A9BB8",
    tooltip_fundo: "rgba(11, 16, 32, 0.95)",
} as const;

/** Cor por tipo de nó do Sankey, usada quando dim_no_sankey[cor_hex] vier vazio. */
export const cor_por_tipo_no: Record<string, string> = {
    receita: paleta_graficos.receita,
    total: paleta_graficos.total,
    custo: paleta_graficos.custo,
    lucro: paleta_graficos.lucro,
    prejuizo: paleta_graficos.prejuizo,
};

/** Overrides de config do Vega-Lite comuns aos gráficos do app (tipografia e grade). */
export const config_vega_app = {
    font: "Inter Variable, Inter, Segoe UI, sans-serif",
    axis: {
        gridColor: paleta_graficos.grade,
        labelColor: paleta_graficos.texto_suave,
        titleColor: paleta_graficos.texto_suave,
        labelFont: "JetBrains Mono Variable, JetBrains Mono, Consolas, monospace",
        labelFontSize: 11,
    },
    legend: {
        labelColor: paleta_graficos.texto_suave,
        labelFontSize: 12,
    },
    view: { stroke: null },
} as const;
