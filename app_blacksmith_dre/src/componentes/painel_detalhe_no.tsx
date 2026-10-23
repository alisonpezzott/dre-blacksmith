// Drill de um nó do Sankey: evolução mensal do valor do nó contra o ano anterior.
// Clicar num mês filtra os demais visuais, como no gráfico de tendência.

import { useMemo } from "react";
import type { QueryTable } from "@microsoft/fabric-app-data";
import { VegaVisual } from "@microsoft/fabric-visuals";
import type { InteractionEvent } from "@microsoft/fabric-visuals-core";
import { X } from "lucide-react";

import { metadados_detalhe_no, montar_spec_detalhe_no } from "@/dados/visuais/detalhe_no";
import { capacidades_selecao } from "@/estado/selecao_cruzada";
import { useThemeContext } from "@/hooks/theme.context";
import { toDataTable } from "@/lib/to-data-table";
import { config_vega, usePaletaGraficos } from "@/tema/tema_graficos";
import { Cartao, EstadoErro, EstadoCarregando, EstadoVazio } from "./estados_carregamento";
import { Legenda } from "./grafico_tendencia";

interface PainelDetalheNoProps {
    nome_no: string;
    cor: string;
    tabela: QueryTable | undefined;
    carregando: boolean;
    erro: Error | undefined;
    subtitulo: string;
    /** indice_mes da seleção cruzada; `null` = nenhum */
    selecionados: number[] | null;
    ao_interagir: (eventos: InteractionEvent[]) => void;
    ao_fechar: () => void;
}

export function PainelDetalheNo({
    nome_no,
    cor,
    tabela,
    carregando,
    erro,
    subtitulo,
    selecionados,
    ao_interagir,
    ao_fechar,
}: PainelDetalheNoProps) {
    const { theme } = useThemeContext();
    const paleta = usePaletaGraficos();
    const dados = useMemo(() => (tabela ? toDataTable(tabela, metadados_detalhe_no) : null), [tabela]);
    const spec = useMemo(() => montar_spec_detalhe_no(paleta, cor, selecionados), [paleta, cor, selecionados]);
    const config = useMemo(() => config_vega(paleta), [paleta]);

    let conteudo;
    if (erro) conteudo = <EstadoErro erro={erro} />;
    else if (carregando && !dados) conteudo = <EstadoCarregando />;
    else if (!dados || dados.rows.length === 0) conteudo = <EstadoVazio mensagem="Este nó não tem valores no período." />;
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
            titulo={`Evolução mensal · ${nome_no}`}
            subtitulo={subtitulo}
            acoes={
                <div className="flex items-center gap-4">
                    <Legenda
                        itens={[
                            { rotulo: nome_no, cor },
                            { rotulo: "Mesmo mês do ano anterior", cor: paleta.total, tracejado: true },
                            { rotulo: "Mês com prejuízo (contorno)", cor: paleta.prejuizo },
                        ]}
                    />
                    <button
                        type="button"
                        onClick={ao_fechar}
                        aria-label="Fechar evolução mensal"
                        className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <X className="icon-size-300" aria-hidden="true" />
                    </button>
                </div>
            }
        >
            <div className="h-64 min-h-0">{conteudo}</div>
        </Cartao>
    );
}
