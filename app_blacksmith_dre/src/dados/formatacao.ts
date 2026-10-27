// Formatação com as format strings do blacksmith_dre, em pt-BR.

import { formatValue, overrideFormattingLocale } from "@microsoft/fabric-visuals-core";

export const locale_app = "pt-BR";

// Os visuais do template (VegaVisual, DataGrid) também passam a formatar em pt-BR.
overrideFormattingLocale(locale_app);

/** Format strings copiadas do modelo (formatString das medidas em _medidas.tmdl). */
export const formatos = {
    moeda: "\\R\\$ #,##0;(\\R\\$ #,##0);-",
    percentual: "0.0%",
    variacao_pct: "+0.0%;-0.0%;0.0%",
    variacao_pp: "+0.0 \\p\\.\\p\\.;-0.0 \\p\\.\\p\\.;0.0 \\p\\.\\p\\.",
    inteiro: "#,##0",
    nps: "0",
    churn: "0.00%",
    data_hora: "dd/MM/yyyy HH:mm",
} as const;

export type Formato = (typeof formatos)[keyof typeof formatos];

const sufixo_pp = " \\p\\.\\p\\.";

/** Formata um valor com a format string do modelo; vazio vira "–". */
export function formatar(valor: unknown, formato: Formato): string {
    if (valor === null || valor === undefined || valor === "") return "–";
    if (formato === formatos.data_hora) {
        const data = valor instanceof Date ? valor : new Date(String(valor));
        return Number.isNaN(data.getTime()) ? String(valor) : String(formatValue(data, formato, { locale: locale_app }));
    }
    if (typeof valor !== "number") return String(valor);
    if (formato === formatos.variacao_pp) {
        // o formatador troca o ponto escapado de "p.p." pelo separador decimal do pt-BR
        const numero = formato.split(";").map((secao) => secao.replace(sufixo_pp, "")).join(";");
        return `${String(formatValue(valor, numero, { locale: locale_app }))} p.p.`;
    }
    return String(formatValue(valor, formato, { locale: locale_app }));
}

const escalas: [number, string][] = [
    [1e9, "bi"],
    [1e6, "mi"],
    [1e3, "mil"],
];

/** Valor em reais abreviado para rótulos: R$ 175,7 mi. */
export function abreviar_moeda(valor: number | null | undefined): string {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return "–";
    const absoluto = Math.abs(valor);
    const [divisor, sufixo] = escalas.find(([limite]) => absoluto >= limite) ?? [1, ""];
    const numero = (absoluto / divisor).toLocaleString(locale_app, {
        minimumFractionDigits: divisor === 1 ? 0 : 1,
        maximumFractionDigits: divisor === 1 ? 0 : 1,
    });
    const texto = `R$ ${numero}${sufixo ? ` ${sufixo}` : ""}`;
    return valor < 0 ? `−${texto}` : texto;
}

/** Percentual simples para rótulos (ex.: 11,7%). */
export function percentual(valor: number | null | undefined, casas = 1): string {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return "–";
    return valor.toLocaleString(locale_app, {
        style: "percent",
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
    });
}
