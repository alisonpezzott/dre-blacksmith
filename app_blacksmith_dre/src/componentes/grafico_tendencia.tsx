// Tendência mensal: receita líquida, lucro líquido e margem líquida (eixo secundário).

import { useMemo } from "react";
import type { QueryTable } from "@microsoft/fabric-app-data";
import { VegaVisual } from "@microsoft/fabric-visuals";

import { metadados_tendencia, spec_tendencia } from "@/dados/visuais/tendencia";
import { useThemeContext } from "@/hooks/theme.context";
import { toDataTable } from "@/lib/to-data-table";
import { config_vega_app, paleta_graficos } from "@/tema/tema_graficos";
import { Cartao, EstadoErro, EstadoCarregando, EstadoVazio } from "./estados_carregamento";

interface GraficoTendenciaProps {
    tabela: QueryTable | undefined;
    carregando: boolean;
    erro: Error | undefined;
    subtitulo: string;
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

export function GraficoTendencia({ tabela, carregando, erro, subtitulo, className }: GraficoTendenciaProps) {
    const { theme } = useThemeContext();
    const dados = useMemo(() => (tabela ? toDataTable(tabela, metadados_tendencia) : null), [tabela]);

    let conteudo;
    if (erro) conteudo = <EstadoErro erro={erro} />;
    else if (carregando && !dados) conteudo = <EstadoCarregando />;
    else if (!dados || dados.rows.length === 0) conteudo = <EstadoVazio />;
    else {
        conteudo = (
            <VegaVisual
                spec={spec_tendencia}
                data={dados}
                theme={theme}
                configVegaLite={config_vega_app}
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
                        { rotulo: "Receita líquida", cor: paleta_graficos.receita },
                        { rotulo: "Lucro líquido", cor: paleta_graficos.lucro },
                        { rotulo: "Margem líquida (eixo direito)", cor: paleta_graficos.total, tracejado: true },
                        { rotulo: "Prejuízo", cor: paleta_graficos.prejuizo },
                    ]}
                />
            }
        >
            <div className="h-72 min-h-0 flex-1">{conteudo}</div>
        </Cartao>
    );
}
