// Estado dos filtros do painel: ano, intervalo de meses, regiões, cenário e a seleção
// cruzada (pontos clicados num visual, que filtram os demais, como no Power BI).

import { useCallback, useState } from "react";

import type { Cenario, DominioFiltros, EstadoFiltros, SelecaoCruzada } from "@/dados/construtor_filtros";

/** Padrão: último ano, ano inteiro, todas as regiões, realizado, sem seleção cruzada. */
export function filtros_padrao(dominio: DominioFiltros): EstadoFiltros {
    return {
        ano: dominio.anos.length > 0 ? Math.max(...dominio.anos) : null,
        mes_inicio: 1,
        mes_fim: 12,
        regioes: [],
        cenario: "realizado",
        selecao: null,
    };
}

export interface AcoesFiltros {
    definir_ano: (ano: number | null) => void;
    definir_meses: (mes_inicio: number, mes_fim: number) => void;
    alternar_regiao: (cod_regiao: string) => void;
    limpar_regioes: () => void;
    definir_cenario: (cenario: Cenario) => void;
    restaurar_padrao: () => void;
    /** Seleção vinda do próprio visual de origem (clique, Ctrl+clique); vazia = clique ignorado. */
    selecionar: (selecao: SelecaoCruzada) => void;
    /** Limpa a seleção. Com `origem`, só limpa se a seleção atual veio desse visual. */
    limpar_selecao: (origem?: string) => void;
}

/**
 * Versão de cada visual de origem. Os visuais guardam internamente os pontos clicados
 * (para alternar e para o Ctrl+clique); quando a seleção muda por fora (outro visual, o
 * botão de limpar ou um filtro da barra), a versão do visual sobe e ele é recriado sem seleção.
 */
export type VersoesVisuais = Record<string, number>;

/**
 * O estado só existe depois que o domínio (anos e regiões das dimensões) chega:
 * até lá retorna `undefined` e nenhuma consulta filtrada é disparada.
 * Mudar qualquer filtro da barra limpa a seleção cruzada, porque os pontos selecionados
 * podem não existir no novo recorte.
 */
export function useEstadoFiltros(
    dominio: DominioFiltros | undefined,
): [EstadoFiltros | undefined, AcoesFiltros, VersoesVisuais] {
    const [alterado, definir_alterado] = useState<EstadoFiltros | undefined>();
    const [versoes, definir_versoes] = useState<VersoesVisuais>({});
    const filtros = alterado ?? (dominio ? filtros_padrao(dominio) : undefined);
    const origem_atual = filtros?.selecao?.origem;

    const reiniciar_visual = useCallback((origem: string | undefined) => {
        if (origem) definir_versoes((atual) => ({ ...atual, [origem]: (atual[origem] ?? 0) + 1 }));
    }, []);

    const atualizar = useCallback(
        (mudanca: (atual: EstadoFiltros) => EstadoFiltros) => {
            if (!dominio) return;
            definir_alterado((anterior) => mudanca(anterior ?? filtros_padrao(dominio)));
        },
        [dominio],
    );

    /** Mudança de filtro da barra: aplica e descarta a seleção cruzada. */
    const atualizar_barra = (mudanca: (atual: EstadoFiltros) => EstadoFiltros) => {
        reiniciar_visual(origem_atual);
        atualizar((atual) => ({ ...mudanca(atual), selecao: null }));
    };

    const acoes: AcoesFiltros = {
        definir_ano: (ano) => atualizar_barra((atual) => ({ ...atual, ano })),
        definir_meses: (mes_inicio, mes_fim) =>
            atualizar_barra((atual) => ({
                ...atual,
                mes_inicio: Math.min(mes_inicio, mes_fim),
                mes_fim: Math.max(mes_inicio, mes_fim),
            })),
        alternar_regiao: (cod_regiao) =>
            atualizar_barra((atual) => {
                const selecionadas = atual.regioes.includes(cod_regiao)
                    ? atual.regioes.filter((cod) => cod !== cod_regiao)
                    : [...atual.regioes, cod_regiao];
                // todas marcadas equivale a nenhuma: volta ao estado "todas as regiões"
                return {
                    ...atual,
                    regioes: dominio && selecionadas.length === dominio.regioes.length ? [] : selecionadas,
                };
            }),
        limpar_regioes: () => atualizar_barra((atual) => ({ ...atual, regioes: [] })),
        definir_cenario: (cenario) => atualizar_barra((atual) => ({ ...atual, cenario })),
        restaurar_padrao: () => {
            reiniciar_visual(origem_atual);
            definir_alterado(undefined);
        },
        selecionar: (selecao) => {
            if (selecao.valores.length === 0) {
                // clique só em pontos que não podem filtrar (ex.: região fora do filtro): o visual
                // é recriado para não guardar uma seleção que o painel não aplicou
                reiniciar_visual(selecao.origem);
                if (origem_atual === selecao.origem) atualizar((atual) => ({ ...atual, selecao: null }));
                return;
            }
            // como no Power BI, selecionar em outro visual descarta a seleção anterior
            if (origem_atual && origem_atual !== selecao.origem) reiniciar_visual(origem_atual);
            atualizar((atual) => ({ ...atual, selecao }));
        },
        limpar_selecao: (origem) => {
            if (origem !== undefined) {
                // o próprio visual pediu: só vale para a seleção dele, e ele já está sem seleção
                if (origem === origem_atual) atualizar((atual) => ({ ...atual, selecao: null }));
                return;
            }
            reiniciar_visual(origem_atual);
            atualizar((atual) => ({ ...atual, selecao: null }));
        },
    };

    return [filtros, acoes, versoes];
}
