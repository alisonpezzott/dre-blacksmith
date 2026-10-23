// Cabeçalho: wordmark BLACKSMITH, subtítulo e data da última carga.

import { DatabaseZap } from "lucide-react";

import { formatar, formatos } from "@/dados/formatacao";
import { Esqueleto } from "./estados_carregamento";

interface CabecalhoAppProps {
    data_ultima_carga: unknown;
    carregando: boolean;
    erro: Error | undefined;
}

export function CabecalhoApp({ data_ultima_carga, carregando, erro }: CabecalhoAppProps) {
    return (
        <header className="linha_marca flex flex-wrap items-end justify-between gap-4 pt-6 pb-2">
            <div className="min-w-0">
                <h1
                    className="font-page-title text-hero-800 leading-hero-800 font-bold tracking-[0.18em]"
                    style={{
                        backgroundImage: "linear-gradient(90deg, var(--cor_ciano), var(--cor_roxo))",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                    }}
                >
                    BLACKSMITH
                </h1>
                <p className="font-page-subtitle text-page-subtitle text-muted-foreground">
                    Do faturamento ao lucro · DRE em Sankey
                </p>
            </div>
            <div className="flex items-center gap-2 text-200 text-muted-foreground" aria-live="polite">
                <DatabaseZap className="icon-size-200 text-ciano" aria-hidden="true" />
                <span>Última carga:</span>
                {carregando ? (
                    <Esqueleto className="h-4 w-28" />
                ) : erro ? (
                    <span className="text-rosa-neon" title={erro.message}>indisponível</span>
                ) : (
                    <span className="numero text-foreground">{formatar(data_ultima_carga, formatos.data_hora)}</span>
                )}
            </div>
        </header>
    );
}
