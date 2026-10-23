// Monta os filtros TREATAS das consultas DAX a partir do estado dos filtros.
// Só aceita valores que vieram das dimensões (whitelist do domínio), nunca texto livre.

export const cenarios = ["realizado", "orcado"] as const;
export type Cenario = (typeof cenarios)[number];

export interface EstadoFiltros {
    /** Ano selecionado; `null` = todos os anos. */
    ano: number | null;
    /** Intervalo de meses (1 a 12, inclusivo). */
    mes_inicio: number;
    mes_fim: number;
    /** Códigos de região selecionados; vazio = todas. */
    regioes: string[];
    cenario: Cenario;
}

/** Valores válidos, lidos das dimensões do modelo. */
export interface DominioFiltros {
    anos: number[];
    regioes: string[];
}

export interface OpcoesFiltros {
    sem_mes?: boolean;
    sem_regiao?: boolean;
    sem_cenario?: boolean;
}

function texto_dax(valor: string): string {
    return `"${valor.replace(/"/g, '""')}"`;
}

function mes_valido(mes: number): boolean {
    return Number.isInteger(mes) && mes >= 1 && mes <= 12;
}

/** Lista de meses do intervalo, ou `null` quando o intervalo cobre o ano inteiro. */
export function meses_do_intervalo(estado: EstadoFiltros): number[] | null {
    if (!mes_valido(estado.mes_inicio) || !mes_valido(estado.mes_fim)) {
        throw new Error(`Intervalo de meses inválido: ${estado.mes_inicio} a ${estado.mes_fim}`);
    }
    const inicio = Math.min(estado.mes_inicio, estado.mes_fim);
    const fim = Math.max(estado.mes_inicio, estado.mes_fim);
    if (inicio === 1 && fim === 12) return null;
    return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
}

/** Regiões efetivamente filtradas, ou `null` quando todas estão selecionadas. */
export function regioes_filtradas(estado: EstadoFiltros, dominio: DominioFiltros): string[] | null {
    const invalidas = estado.regioes.filter((cod) => !dominio.regioes.includes(cod));
    if (invalidas.length > 0) {
        throw new Error(`Região fora do domínio: ${invalidas.join(", ")}`);
    }
    const unicas = dominio.regioes.filter((cod) => estado.regioes.includes(cod));
    if (unicas.length === 0 || unicas.length === dominio.regioes.length) return null;
    return unicas;
}

/** Filtros DAX (um TREATAS por dimensão filtrada) para usar dentro de SUMMARIZECOLUMNS ou CALCULATETABLE. */
export function montar_filtros(
    estado: EstadoFiltros,
    dominio: DominioFiltros,
    opcoes: OpcoesFiltros = {},
): string[] {
    const filtros: string[] = [];

    if (!opcoes.sem_cenario) {
        if (!cenarios.includes(estado.cenario)) {
            throw new Error(`Cenário inválido: ${String(estado.cenario)}`);
        }
        filtros.push(`TREATAS ( { ${texto_dax(estado.cenario)} }, dim_cenario[cod_cenario] )`);
    }

    if (estado.ano !== null) {
        if (!Number.isInteger(estado.ano) || !dominio.anos.includes(estado.ano)) {
            throw new Error(`Ano fora do domínio: ${estado.ano}`);
        }
        filtros.push(`TREATAS ( { ${estado.ano} }, dim_calendario[ano] )`);
    }

    if (!opcoes.sem_mes) {
        const meses = meses_do_intervalo(estado);
        if (meses) filtros.push(`TREATAS ( { ${meses.join(", ")} }, dim_calendario[mes] )`);
    }

    if (!opcoes.sem_regiao) {
        const regioes = regioes_filtradas(estado, dominio);
        if (regioes) {
            filtros.push(`TREATAS ( { ${regioes.map(texto_dax).join(", ")} }, dim_regiao[cod_regiao] )`);
        }
    }

    return filtros;
}

/** Junta os filtros como argumentos extras (", filtro1, filtro2"), ou "" quando não há filtro. */
export function argumentos_filtros(filtros: string[]): string {
    return filtros.length === 0 ? "" : filtros.map((f) => `,\n    ${f}`).join("");
}
