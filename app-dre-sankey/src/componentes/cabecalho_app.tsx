// Cabeçalho: nome do app, subtítulo, data da última carga e alternância de tema.

import { DatabaseZap, Moon, Sun } from "lucide-react";

import { formatar, formatos } from "@/dados/formatacao";
import { useThemeContext } from "@/hooks/theme.context";
import { Esqueleto } from "./estados_carregamento";

interface CabecalhoAppProps {
    data_ultima_carga: unknown;
    carregando: boolean;
    erro: Error | undefined;
}

export function CabecalhoApp({ data_ultima_carga, carregando, erro }: CabecalhoAppProps) {
    const { isDark, toggleTheme } = useThemeContext();

    return (
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pt-6 pb-3">
            <div className="min-w-0">
                <h1 className="font-page-title text-hero-700 leading-hero-700 text-foreground">
                    <span className="font-semibold">Blacksmith</span> <span className="font-light">DRE</span>
                </h1>
                <p className="font-page-subtitle text-page-subtitle text-muted-foreground">
                    Do faturamento ao lucro · DRE em Sankey
                </p>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-200 text-muted-foreground" aria-live="polite">
                    <DatabaseZap className="icon-size-200" aria-hidden="true" />
                    <span>Última carga:</span>
                    {carregando ? (
                        <Esqueleto className="h-4 w-28" />
                    ) : erro ? (
                        <span className="text-prejuizo-texto" title={erro.message}>indisponível</span>
                    ) : (
                        <span className="numero text-foreground">{formatar(data_ultima_carga, formatos.data_hora)}</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={toggleTheme}
                    aria-label={isDark ? "Usar tema claro" : "Usar tema escuro"}
                    title={isDark ? "Tema claro" : "Tema escuro"}
                    className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {isDark ? <Sun className="icon-size-200" aria-hidden="true" /> : <Moon className="icon-size-200" aria-hidden="true" />}
                </button>
            </div>
        </header>
    );
}
