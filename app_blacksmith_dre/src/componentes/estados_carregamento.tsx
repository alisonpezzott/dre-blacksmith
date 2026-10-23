// Estados de carregamento (skeleton com shimmer ciano), vazio e erro.

import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export function Esqueleto({ className }: { className?: string }) {
    return <div className={cn("esqueleto", className)} aria-hidden="true" />;
}

export function EstadoCarregando({ className, rotulo = "Carregando dados do modelo…" }: { className?: string; rotulo?: string }) {
    return (
        <div className={cn("flex h-full w-full flex-col gap-3", className)} role="status" aria-live="polite">
            <span className="sr-only">{rotulo}</span>
            <Esqueleto className="h-4 w-1/3" />
            <Esqueleto className="min-h-24 w-full flex-1" />
        </div>
    );
}

export function EstadoVazio({ mensagem = "Nenhum dado para os filtros selecionados." }: { mensagem?: string }) {
    return (
        <div className="flex h-full min-h-24 w-full flex-col items-center justify-center gap-2 text-center text-300 text-muted-foreground">
            <Inbox className="icon-size-400 text-texto-fraco" aria-hidden="true" />
            <p>{mensagem}</p>
        </div>
    );
}

export function EstadoErro({ erro, titulo = "Não foi possível consultar o modelo semântico" }: { erro: Error; titulo?: string }) {
    return (
        <div
            role="alert"
            className="flex w-full items-start gap-3 rounded-xl border border-rosa-neon/40 bg-rosa-neon/10 p-4 text-left"
        >
            <AlertTriangle className="mt-0.5 icon-size-300 shrink-0 text-rosa-neon" aria-hidden="true" />
            <div className="min-w-0">
                <p className="text-300 font-semibold text-foreground">{titulo}</p>
                <p className="mt-1 break-words text-200 text-muted-foreground">{erro.message}</p>
            </div>
        </div>
    );
}

/** Cartão padrão do painel (vidro escuro), com título e subtítulo. */
export function Cartao({
    titulo,
    subtitulo,
    acoes,
    children,
    className,
    destaque = false,
}: {
    titulo?: string;
    subtitulo?: string;
    acoes?: ReactNode;
    children: ReactNode;
    className?: string;
    destaque?: boolean;
}) {
    return (
        <section className={cn("cartao_vidro flex min-w-0 flex-col p-4", destaque && "linha_marca", className)}>
            {(titulo || acoes) && (
                <header className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        {titulo && <h2 className="font-heading text-400 font-semibold leading-400 text-foreground">{titulo}</h2>}
                        {subtitulo && <p className="mt-0.5 text-200 text-muted-foreground">{subtitulo}</p>}
                    </div>
                    {acoes}
                </header>
            )}
            {children}
        </section>
    );
}
