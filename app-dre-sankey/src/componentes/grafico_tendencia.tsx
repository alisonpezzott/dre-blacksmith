// Tendência mensal: receita líquida, lucro líquido e margem líquida (eixo secundário).
// Clicar num mês filtra os demais visuais (Ctrl+clique soma meses).

import { useMemo } from "react";
import type { QueryTable } from "@microsoft/fabric-app-data";
import { VegaVisual } from "@microsoft/fabric-visuals";
import type { InteractionEvent } from "@microsoft/fabric-visuals-core";

import { metadados_tendencia, montar_spec_tendencia } from "@/dados/visuais/tendencia";
import { useThemeContext } from "@/hooks/theme.context";
import { toDataTable } from "@/lib/to-data-table";
import { capacidades_selecao } from "@/estado/selecao_cruzada";
import { config_vega, usePaletaGraficos } from "@/tema/tema_graficos";
import { Cartao, EstadoErro, EstadoCarregando, EstadoVazio } from "./estados_carregamento";

interface GraficoTendenciaProps {
    tabela: QueryTable | undefined;
    carregando: boolean;
    erro: Error | undefined;
    subtitulo: string;
    /** meses (1 a 12) do filtro da barra; `null` = ano inteiro */
    intervalo: number[] | null;
    /** indice_mes da seleção cruzada; `null` = nenhum */
    selecionados: number[] | null;
    ao_interagir: (eventos: InteractionEvent[]) => void;
    className?: string;
}

export function Legenda({ itens }: { itens: { rotulo: string; cor: string; tracejado?: boolean }[] }) {
    return (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-200 text-muted-foreground">
            {itens.map((item) => (
                <li key={item.rotulo} className="flex items-center gap-1.5">
                    <span
                        aria-hidden="true"
                        className="inline-block h-0.5 w-4"
                        style={{
                            background: item.tracejado
                                ? `repeating-linear-gradient(90deg, ${item.cor} 0 4px, transparent 4px 7px)`
                                : item.cor,
                        }}
                    />
                    {item.rotulo}
                </li>
            ))}
        </ul>
    );
}

export function GraficoTendencia({
    tabela,
    carregando,
    erro,
    subtitulo,
    intervalo,
    selecionados,
    ao_interagir,
    className,
}: GraficoTendenciaProps) {
    const { theme } = useThemeContext();
    const paleta = usePaletaGraficos();
    const dados = useMemo(() => (tabela ? toDataTable(tabela, metadados_tendencia) : null), [tabela]);
    const spec = useMemo(() => montar_spec_tendencia(paleta, intervalo, selecionados), [paleta, intervalo, selecionados]);
    const config = useMemo(() => config_vega(paleta), [paleta]);

    let conteudo;
    if (erro) conteudo = <EstadoErro erro={erro} />;
    else if (carregando && !dados) conteudo = <EstadoCarregando />;
    else if (!dados || dados.rows.length === 0) conteudo = <EstadoVazio />;
    else {
        conteudo = (
            <VegaVisual
                spec={spec}
                data={dados}
                theme={theme}
                configVegaLite={config}
                capabilities={capacidades_selecao}
                onInteraction={ao_interagir}
                chromeless
                className="h-full w-full"
            />
        );
    }

    return (
        <Cartao
            titulo="Tendência mensal"
            subtitulo={subtitulo}
            className={className}
            acoes={
                <Legenda
                    itens={[
                        { rotulo: "Receita líquida", cor: paleta.receita },
                        { rotulo: "Lucro líquido", cor: paleta.lucro },
                        { rotulo: "Margem líquida (eixo direito)", cor: paleta.total, tracejado: true },
                        { rotulo: "Prejuízo", cor: paleta.prejuizo },
                    ]}
                />
            }
        >
            <div className="h-72 min-h-0 flex-1">{conteudo}</div>
            <p className="mt-2 text-200 text-texto-fraco">
                Clique num mês para filtrar o painel; Ctrl+clique soma meses; clique de novo ou Esc para limpar.
            </p>
        </Cartao>
    );
}
