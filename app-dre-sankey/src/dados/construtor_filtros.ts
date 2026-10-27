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
    /** Seleção de pontos de dados num visual (filtragem cruzada); ausente = nenhuma. */
    selecao?: SelecaoCruzada | null;
}

/**
 * Filtragem cruzada, como no Power BI: os pontos clicados num visual filtram os demais.
 * O visual de origem não é filtrado pela própria seleção (só esmaece os demais pontos):
 * os visuais por mês ignoram a seleção de meses (sem_mes) e o de regiões ignora a de regiões (sem_regiao).
 */
export type SelecaoCruzada =
    | { origem: string; campo: "indice_mes"; valores: number[] }
    | { origem: string; campo: "cod_regiao"; valores: string[] };

/** Valores válidos, lidos das dimensões do modelo. */
export interface DominioFiltros {
    anos: number[];
    regioes: string[];
    /** dim_calendario[indice_mes]: obrigatório para aceitar uma seleção de meses. */
    indices_mes?: number[];
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

/** Meses (indice_mes) da seleção cruzada, validados contra o calendário; `null` sem seleção de meses. */
export function meses_selecionados(estado: EstadoFiltros, dominio: DominioFiltros): number[] | null {
    const selecao = estado.selecao;
    if (!selecao || selecao.campo !== "indice_mes" || selecao.valores.length === 0) return null;
    const invalidos = selecao.valores.filter((i) => !Number.isInteger(i) || !(dominio.indices_mes ?? []).includes(i));
    if (invalidos.length > 0) {
        throw new Error(`Mês selecionado fora do domínio: ${invalidos.join(", ")}`);
    }
    return [...new Set(selecao.valores)].sort((a, b) => a - b);
}

/**
 * Regiões da seleção cruzada, validadas contra o domínio e contidas no filtro de regiões;
 * `null` sem seleção de regiões.
 */
export function regioes_selecionadas(estado: EstadoFiltros, dominio: DominioFiltros): string[] | null {
    const selecao = estado.selecao;
    if (!selecao || selecao.campo !== "cod_regiao" || selecao.valores.length === 0) return null;
    const invalidas = selecao.valores.filter((cod) => !dominio.regioes.includes(cod));
    if (invalidas.length > 0) {
        throw new Error(`Região selecionada fora do domínio: ${invalidas.join(", ")}`);
    }
    const no_filtro = regioes_filtradas(estado, dominio);
    const fora = selecao.valores.filter((cod) => no_filtro !== null && !no_filtro.includes(cod));
    if (fora.length > 0) {
        throw new Error(`Região selecionada fora do filtro de regiões: ${fora.join(", ")}`);
    }
    return dominio.regioes.filter((cod) => selecao.valores.includes(cod));
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
        const selecionados = meses_selecionados(estado, dominio);
        if (selecionados) filtros.push(`TREATAS ( { ${selecionados.join(", ")} }, dim_calendario[indice_mes] )`);
    }

    if (!opcoes.sem_regiao) {
        // a seleção cruzada fica dentro do filtro de regiões, então a substitui
        const regioes = regioes_selecionadas(estado, dominio) ?? regioes_filtradas(estado, dominio);
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
