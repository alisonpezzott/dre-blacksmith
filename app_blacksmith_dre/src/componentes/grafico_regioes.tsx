// Receita líquida por região, com a margem líquida em rótulo.

import { useMemo } from "react";
import type { QueryTable } from "@microsoft/fabric-app-data";
import { VegaVisual } from "@microsoft/fabric-visuals";

import { montar_spec_regioes, metadados_regioes } from "@/dados/visuais/regioes";
import { useThemeContext } from "@/hooks/theme.context";
import { toDataTable } from "@/lib/to-data-table";
import { config_vega_app } from "@/tema/tema_graficos";
import { Cartao, EstadoErro, EstadoCarregando, EstadoVazio } from "./estados_carregamento";

interface GraficoRegioesProps {
    tabela: QueryTable | undefined;
    carregando: boolean;
    erro: Error | undefined;
    /** regiões do filtro; `null` = todas */
    selecionadas: string[] | null;
    subtitulo: string;
    className?: string;
}

export function GraficoRegioes({ tabela, carregando, erro, selecionadas, subtitulo, className }: GraficoRegioesProps) {
    const { theme } = useThemeContext();
    const dados = useMemo(() => (tabela ? toDataTable(tabela, metadados_regioes) : null), [tabela]);
    const spec = useMemo(() => montar_spec_regioes(selecionadas), [selecionadas]);

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
                configVegaLite={config_vega_app}
                chromeless
                className="h-full w-full"
            />
        );
    }

    return (
        <Cartao titulo="Receita líquida por região" subtitulo={subtitulo} className={className}>
            <div className="h-72 min-h-0 flex-1">{conteudo}</div>
            <p className="mt-2 text-200 text-texto-fraco">Rótulo: margem líquida. As demais regiões ficam esmaecidas quando há filtro.</p>
        </Cartao>
    );
}
