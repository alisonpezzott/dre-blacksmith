// Paletas dos gráficos por tema (seção 9.3 do CLAUDE.md), com as cores de visualização
// do IBM Carbon. Semântica fixa: receita = ciano; totais e orçado = roxo; custo e queda =
// laranja; lucro e alta = verde; prejuízo = vermelho (uso exclusivo).
// Os valores repetem os de tokens_tema.css porque o Vega e o SVG precisam de cores literais.

import { useThemeContext } from "@/hooks/theme.context";

export type Tema = "escuro" | "claro";

export interface PaletaGraficos {
    receita: string;
    total: string;
    custo: string;
    lucro: string;
    prejuizo: string;
    prejuizo_texto: string;
    /** fundo das faixas e barras selecionadas pela filtragem cruzada */
    selecionado: string;
    grade: string;
    eixo: string;
    texto: string;
    texto_suave: string;
    superficie: string;
}

export const paletas: Record<Tema, PaletaGraficos> = {
    escuro: {
        receita: "#33b1ff",       // Cyan 40
        total: "#8a3ffc",         // Purple 60
        custo: "#ff832b",         // Orange 40
        lucro: "#6fdc8c",         // Green 30
        prejuizo: "#fa4d56",      // Red 50
        prejuizo_texto: "#ff8389",
        selecionado: "#393939",   // layer-selected-01 (g100)
        grade: "#393939",
        eixo: "#6f6f6f",
        texto: "#f4f4f4",
        texto_suave: "#c6c6c6",
        superficie: "#262626",
    },
    claro: {
        receita: "#1192e8",       // Cyan 50
        total: "#6929c4",         // Purple 70
        custo: "#ba4e00",         // Orange 60
        lucro: "#198038",         // Green 60
        prejuizo: "#da1e28",      // Red 60
        prejuizo_texto: "#da1e28",
        selecionado: "#e0e0e0",   // layer-selected-01 (g10)
        grade: "#e0e0e0",
        eixo: "#8d8d8d",
        texto: "#161616",
        texto_suave: "#525252",
        superficie: "#ffffff",
    },
};

/** Opacidade dos pontos fora da seleção (filtragem cruzada), como no Power BI. */
export const opacidade_esmaecida = 0.3;

/** Paleta do tema ativo. */
export function usePaletaGraficos(): PaletaGraficos {
    const { isDark } = useThemeContext();
    return paletas[isDark ? "escuro" : "claro"];
}

/**
 * Cor do nó do Sankey pelo tipo (receita, total, custo, lucro, prejuízo).
 * dim_no_sankey[cor_hex] não é usada pelo app porque não muda com o tema.
 */
export function cor_por_tipo_no(paleta: PaletaGraficos, tipo_no: string): string {
    switch (tipo_no) {
        case "receita": return paleta.receita;
        case "custo": return paleta.custo;
        case "lucro": return paleta.lucro;
        case "prejuizo": return paleta.prejuizo;
        default: return paleta.total;
    }
}

const fonte_texto = "IBM Plex Sans Variable, IBM Plex Sans, Segoe UI, sans-serif";
const fonte_numero = "IBM Plex Mono, Consolas, monospace";

/** Overrides de config do Vega-Lite comuns aos gráficos do app (tipografia, grade e eixos da Carbon). */
export function config_vega(paleta: PaletaGraficos) {
    return {
        font: fonte_texto,
        axis: {
            gridColor: paleta.grade,
            domainColor: paleta.eixo,
            tickColor: paleta.eixo,
            labelColor: paleta.texto_suave,
            titleColor: paleta.texto_suave,
            labelFont: fonte_numero,
            labelFontSize: 11,
            labelFontWeight: 400,
        },
        legend: {
            labelColor: paleta.texto_suave,
            labelFontSize: 12,
        },
        text: { font: fonte_numero, fontWeight: 400 },
        view: { stroke: null },
    } as const;
}
