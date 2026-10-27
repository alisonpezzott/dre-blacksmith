// Receita líquida por região, com a margem líquida em rótulo.
// Clicar numa região filtra os demais visuais (Ctrl+clique soma regiões).

import { useMemo } from "react";
import type { QueryTable } from "@microsoft/fabric-app-data";
import { VegaVisual } from "@microsoft/fabric-visuals";
import type { InteractionEvent } from "@microsoft/fabric-visuals-core";

import { montar_spec_regioes, metadados_regioes } from "@/dados/visuais/regioes";
import { capacidades_selecao } from "@/estado/selecao_cruzada";
import { useThemeContext } from "@/hooks/theme.context";
import { toDataTable } from "@/lib/to-data-table";
import { config_vega, usePaletaGraficos } from "@/tema/tema_graficos";
import { Cartao, EstadoErro, EstadoCarregando, EstadoVazio } from "./estados_carregamento";

interface GraficoRegioesProps {
    tabela: QueryTable | undefined;
    carregando: boolean;
    erro: Error | undefined;
    /** regiões do filtro da barra; `null` = todas */
    no_filtro: string[] | null;
    /** regiões da seleção cruzada; `null` = nenhuma */
    selecionadas: string[] | null;
    ao_interagir: (eventos: InteractionEvent[]) => void;
    subtitulo: string;
    className?: string;
}

export function GraficoRegioes({
    tabela,
    carregando,
    erro,
    no_filtro,
    selecionadas,
    ao_interagir,
    subtitulo,
    className,
}: GraficoRegioesProps) {
    const { theme } = useThemeContext();
    const paleta = usePaletaGraficos();
    const dados = useMemo(() => (tabela ? toDataTable(tabela, metadados_regioes) : null), [tabela]);
    const spec = useMemo(() => montar_spec_regioes(paleta, no_filtro, selecionadas), [paleta, no_filtro, selecionadas]);
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
        <Cartao titulo="Receita líquida por região" subtitulo={subtitulo} className={className}>
            <div className="h-72 min-h-0 flex-1">{conteudo}</div>
            <p className="mt-2 text-200 text-texto-fraco">
                Rótulo: margem líquida. Clique numa região para filtrar o painel; Ctrl+clique soma regiões.
            </p>
        </Cartao>
    );
}
