// Indicadores operacionais do recorte (só existem no realizado).

import { Activity, Briefcase, HeartHandshake, TrendingDown, UserPlus, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { numero, type Linha } from "@/dados/cliente_modelo";
import { formatar, formatos, type Formato } from "@/dados/formatacao";
import { Cartao, EstadoErro, Esqueleto, EstadoVazio } from "./estados_carregamento";

interface PainelOperacionalProps {
    linha: Linha | undefined;
    carregando: boolean;
    erro: Error | undefined;
    subtitulo: string;
    cenario_orcado: boolean;
    className?: string;
}

const indicadores: { campo: string; rotulo: string; formato: Formato; icone: LucideIcon; nota?: string }[] = [
    { campo: "clientes_ativos", rotulo: "Clientes ativos", formato: formatos.inteiro, icone: Users, nota: "último mês" },
    { campo: "novos_clientes", rotulo: "Novos clientes", formato: formatos.inteiro, icone: UserPlus },
    { campo: "churn_medio_pct", rotulo: "Churn médio", formato: formatos.churn, icone: TrendingDown },
    { campo: "nps_medio", rotulo: "NPS médio", formato: formatos.nps, icone: HeartHandshake },
    { campo: "headcount", rotulo: "Headcount", formato: formatos.inteiro, icone: Briefcase, nota: "último mês" },
    { campo: "receita_por_cliente", rotulo: "Receita por cliente", formato: formatos.moeda, icone: Wallet },
    { campo: "receita_por_colaborador", rotulo: "Receita por colaborador", formato: formatos.moeda, icone: Activity },
];

export function PainelOperacional({ linha, carregando, erro, subtitulo, cenario_orcado, className }: PainelOperacionalProps) {
    let conteudo;
    if (erro) conteudo = <EstadoErro erro={erro} />;
    else if (!carregando && !linha) conteudo = <EstadoVazio />;
    else {
        conteudo = (
            <dl className="grid grid-cols-2 gap-3">
                {indicadores.map(({ campo, rotulo, formato, icone: Icone, nota }) => (
                    <div
                        key={campo}
                        className="flex flex-col gap-1 rounded-xl border border-border bg-superficie-2/60 p-3 last:col-span-2"
                    >
                        <dt className="flex items-center gap-1.5 text-200 text-muted-foreground">
                            <Icone className="icon-size-200 text-ciano" aria-hidden="true" />
                            {rotulo}
                            {nota && <span className="text-texto-fraco">· {nota}</span>}
                        </dt>
                        <dd className="numero text-500 leading-500 font-semibold text-foreground">
                            {carregando && !linha ? <Esqueleto className="h-6 w-24" /> : formatar(numero(linha, campo), formato)}
                        </dd>
                    </div>
                ))}
            </dl>
        );
    }

    return (
        <Cartao titulo="Operação" subtitulo={subtitulo} className={className}>
            {cenario_orcado && (
                <p className="mb-3 rounded-lg border border-roxo/40 bg-roxo/10 px-3 py-2 text-300 text-foreground">
                    O orçamento não tem indicadores operacionais: estes números são do realizado.
                </p>
            )}
            {conteudo}
        </Cartao>
    );
}
