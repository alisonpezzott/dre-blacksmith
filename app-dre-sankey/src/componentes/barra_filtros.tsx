// Barra de filtros fixa no topo: ano, intervalo de meses, regiões e cenário.
// As opções vêm das dimensões do modelo (rótulos das colunas nome_*). Mostra também a
// seleção cruzada ativa (pontos clicados nos visuais), com o botão para limpá-la.

import type { ReactNode } from "react";
import { Calendar, Filter, Layers, MapPin, RotateCcw, X } from "lucide-react";

import type { Cenario, EstadoFiltros } from "@/dados/construtor_filtros";
import type { AcoesFiltros } from "@/estado/estado_filtros";
import { cn } from "@/lib/utils";

export interface OpcoesBarraFiltros {
    anos: number[];
    meses: { mes: number; nome_mes: string }[];
    regioes: { cod_regiao: string; nome_regiao: string; ufs: string }[];
    cenarios: { cod_cenario: Cenario; nome_cenario: string }[];
}

interface BarraFiltrosProps {
    filtros: EstadoFiltros;
    acoes: AcoesFiltros;
    opcoes: OpcoesBarraFiltros;
    padrao: EstadoFiltros;
    /** rótulo da seleção cruzada ("Mar/2025, Abr/2025"); `null` = sem seleção */
    rotulo_selecao: string | null;
}

function Botao({
    ativo,
    onClick,
    children,
    rotulo,
}: {
    ativo: boolean;
    onClick: () => void;
    children: ReactNode;
    rotulo?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={ativo}
            aria-label={rotulo}
            className={cn(
                "border px-3 py-1.5 text-200 transition-colors duration-100 ease-out",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                ativo
                    ? "border-transparent bg-foreground text-background"
                    : "border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
        >
            {children}
        </button>
    );
}

function Grupo({ icone, rotulo, children }: { icone: ReactNode; rotulo: string; children: ReactNode }) {
    return (
        <div role="group" aria-label={rotulo} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 flex items-center gap-1.5 text-200 text-texto-fraco">
                {icone}
                <span className="hidden sm:inline">{rotulo}</span>
            </span>
            {children}
        </div>
    );
}

const classe_select =
    "border-0 border-b border-borda-forte bg-superficie-2 px-2 py-1.5 text-200 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function BarraFiltros({ filtros, acoes, opcoes, padrao, rotulo_selecao }: BarraFiltrosProps) {
    const todas_regioes = filtros.regioes.length === 0;
    const alterado = JSON.stringify({ ...filtros, selecao: null }) !== JSON.stringify({ ...padrao, selecao: null });

    return (
        <div className="sticky top-0 z-30 -mx-4 border-b border-border bg-background px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <Grupo icone={<Calendar className="icon-size-200" aria-hidden="true" />} rotulo="Ano">
                    {opcoes.anos.map((ano) => (
                        <Botao key={ano} ativo={filtros.ano === ano} onClick={() => acoes.definir_ano(ano)}>
                            <span className="numero">{ano}</span>
                        </Botao>
                    ))}
                    <Botao ativo={filtros.ano === null} onClick={() => acoes.definir_ano(null)}>
                        Todos
                    </Botao>
                </Grupo>

                <Grupo icone={<Calendar className="icon-size-200" aria-hidden="true" />} rotulo="Meses">
                    <label className="sr-only" htmlFor="mes_inicio">Mês inicial</label>
                    <select
                        id="mes_inicio"
                        className={classe_select}
                        value={filtros.mes_inicio}
                        onChange={(e) => acoes.definir_meses(Number(e.target.value), filtros.mes_fim)}
                    >
                        {opcoes.meses.map((m) => (
                            <option key={m.mes} value={m.mes}>{m.nome_mes}</option>
                        ))}
                    </select>
                    <span className="text-200 text-texto-fraco">até</span>
                    <label className="sr-only" htmlFor="mes_fim">Mês final</label>
                    <select
                        id="mes_fim"
                        className={classe_select}
                        value={filtros.mes_fim}
                        onChange={(e) => acoes.definir_meses(filtros.mes_inicio, Number(e.target.value))}
                    >
                        {opcoes.meses.map((m) => (
                            <option key={m.mes} value={m.mes}>{m.nome_mes}</option>
                        ))}
                    </select>
                </Grupo>

                <Grupo icone={<MapPin className="icon-size-200" aria-hidden="true" />} rotulo="Regiões">
                    <Botao ativo={todas_regioes} onClick={acoes.limpar_regioes}>
                        Todas
                    </Botao>
                    {opcoes.regioes.map((r) => (
                        <Botao
                            key={r.cod_regiao}
                            ativo={filtros.regioes.includes(r.cod_regiao)}
                            onClick={() => acoes.alternar_regiao(r.cod_regiao)}
                            rotulo={`${r.nome_regiao} (${r.ufs})`}
                        >
                            {r.nome_regiao}
                        </Botao>
                    ))}
                </Grupo>

                <Grupo icone={<Layers className="icon-size-200" aria-hidden="true" />} rotulo="Cenário">
                    {opcoes.cenarios.map((c) => (
                        <Botao
                            key={c.cod_cenario}
                            ativo={filtros.cenario === c.cod_cenario}
                            onClick={() => acoes.definir_cenario(c.cod_cenario)}
                        >
                            {c.nome_cenario}
                        </Botao>
                    ))}
                </Grupo>

                {rotulo_selecao && (
                    <div
                        className="flex items-center gap-1.5 rounded-full bg-selecionado py-1 pr-1 pl-3 text-200 text-foreground"
                        role="status"
                    >
                        <Filter className="icon-size-100" aria-hidden="true" />
                        <span>
                            Seleção: <span className="numero">{rotulo_selecao}</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => acoes.limpar_selecao()}
                            aria-label="Limpar seleção cruzada"
                            title="Limpar seleção (Esc)"
                            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X className="icon-size-100" aria-hidden="true" />
                        </button>
                    </div>
                )}

                {alterado && (
                    <button
                        type="button"
                        onClick={acoes.restaurar_padrao}
                        className="ml-auto flex items-center gap-1.5 px-2 py-1.5 text-200 text-interativo hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <RotateCcw className="icon-size-200" aria-hidden="true" />
                        Restaurar padrão
                    </button>
                )}
            </div>
        </div>
    );
}
