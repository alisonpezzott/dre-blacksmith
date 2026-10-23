// Estado dos filtros do painel: ano, intervalo de meses, regiões e cenário.

import { useCallback, useState } from "react";

import type { Cenario, DominioFiltros, EstadoFiltros } from "@/dados/construtor_filtros";

/** Padrão: último ano, ano inteiro, todas as regiões, realizado. */
export function filtros_padrao(dominio: DominioFiltros): EstadoFiltros {
    return {
        ano: dominio.anos.length > 0 ? Math.max(...dominio.anos) : null,
        mes_inicio: 1,
        mes_fim: 12,
        regioes: [],
        cenario: "realizado",
    };
}

export interface AcoesFiltros {
    definir_ano: (ano: number | null) => void;
    definir_meses: (mes_inicio: number, mes_fim: number) => void;
    alternar_regiao: (cod_regiao: string) => void;
    limpar_regioes: () => void;
    definir_cenario: (cenario: Cenario) => void;
}

/**
 * O estado só existe depois que o domínio (anos e regiões das dimensões) chega:
 * até lá retorna `undefined` e nenhuma consulta filtrada é disparada.
 */
export function useEstadoFiltros(dominio: DominioFiltros | undefined): [EstadoFiltros | undefined, AcoesFiltros] {
    const [alterado, definir_alterado] = useState<EstadoFiltros | undefined>();
    const filtros = alterado ?? (dominio ? filtros_padrao(dominio) : undefined);

    const atualizar = useCallback(
        (mudanca: (atual: EstadoFiltros) => EstadoFiltros) => {
            if (!dominio) return;
            definir_alterado((anterior) => mudanca(anterior ?? filtros_padrao(dominio)));
        },
        [dominio],
    );

    const acoes: AcoesFiltros = {
        definir_ano: (ano) => atualizar((atual) => ({ ...atual, ano })),
        definir_meses: (mes_inicio, mes_fim) =>
            atualizar((atual) => ({
                ...atual,
                mes_inicio: Math.min(mes_inicio, mes_fim),
                mes_fim: Math.max(mes_inicio, mes_fim),
            })),
        alternar_regiao: (cod_regiao) =>
            atualizar((atual) => {
                const selecionadas = atual.regioes.includes(cod_regiao)
                    ? atual.regioes.filter((cod) => cod !== cod_regiao)
                    : [...atual.regioes, cod_regiao];
                // todas marcadas equivale a nenhuma: volta ao estado "todas as regiões"
                return {
                    ...atual,
                    regioes: dominio && selecionadas.length === dominio.regioes.length ? [] : selecionadas,
                };
            }),
        limpar_regioes: () => atualizar((atual) => ({ ...atual, regioes: [] })),
        definir_cenario: (cenario) => atualizar((atual) => ({ ...atual, cenario })),
    };

    return [filtros, acoes];
}
