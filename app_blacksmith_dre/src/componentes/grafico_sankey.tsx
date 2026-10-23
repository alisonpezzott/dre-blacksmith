// Sankey da DRE: como a receita vira lucro (ou prejuízo) no recorte filtrado.
// Os valores dos links vêm prontos da medida sankey_valor; aqui só há layout e desenho.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { sankeyLinkHorizontal, type SankeyLink } from "d3-sankey";

import { abreviar_moeda, formatar, formatos, percentual } from "@/dados/formatacao";
import {
    calcular_layout,
    type LinkLayout,
    type LinkSankeyEntrada,
    type NoLayout,
    type NoSankeyEntrada,
} from "@/dados/layout_sankey";
import { cn } from "@/lib/utils";
import { cor_por_tipo_no, paleta_graficos } from "@/tema/tema_graficos";
import { EstadoErro, EstadoVazio, Esqueleto } from "./estados_carregamento";

const altura_total = 560;
const largura_minima = 1100;
const margem = { topo: 16, base: 16, esquerda: 4, direita: 196 };
const largura_no = 14;
const altura_rotulo = 30;

interface GraficoSankeyProps {
    nos: NoSankeyEntrada[] | undefined;
    links: LinkSankeyEntrada[] | undefined;
    carregando: boolean;
    erro: Error | undefined;
    /** muda a cada recorte para reiniciar a animação de entrada */
    chave_recorte: string;
    no_selecionado: string | null;
    ao_selecionar_no: (no: NoLayout) => void;
}

interface Dica {
    x: number;
    y: number;
    titulo: string;
    linhas: [string, string][];
    prejuizo: boolean;
}

const gerador_faixa = sankeyLinkHorizontal();

function caminho(link: LinkLayout): string {
    return gerador_faixa(link as unknown as SankeyLink<object, object>) ?? "";
}

function cor_no(no: NoSankeyEntrada): string {
    return no.cor_hex || cor_por_tipo_no[no.tipo_no] || paleta_graficos.total;
}

/** Posição vertical dos rótulos por coluna, empurrando para baixo os que se sobrepõem. */
function posicoes_rotulos(nos: NoLayout[]): Map<string, number> {
    const posicoes = new Map<string, number>();
    const por_coluna = new Map<number, NoLayout[]>();
    for (const no of nos) por_coluna.set(no.coluna, [...(por_coluna.get(no.coluna) ?? []), no]);
    for (const grupo of por_coluna.values()) {
        let limite = -Infinity;
        for (const no of [...grupo].sort((a, b) => a.y0 - b.y0)) {
            const centro = Math.max((no.y0 + no.y1) / 2 - altura_rotulo / 2, limite);
            posicoes.set(no.cod_no, centro);
            limite = centro + altura_rotulo;
        }
    }
    return posicoes;
}

export function GraficoSankey({
    nos,
    links,
    carregando,
    erro,
    chave_recorte,
    no_selecionado,
    ao_selecionar_no,
}: GraficoSankeyProps) {
    const conteiner = useRef<HTMLDivElement>(null);
    const [largura_conteiner, definir_largura] = useState(largura_minima);
    const [destaque, definir_destaque] = useState<{ link?: string; no?: string } | null>(null);
    const [dica, definir_dica] = useState<Dica | null>(null);

    useEffect(() => {
        const elemento = conteiner.current;
        if (!elemento) return;
        const observador = new ResizeObserver(([entrada]) => definir_largura(entrada.contentRect.width));
        observador.observe(elemento);
        return () => observador.disconnect();
    }, []);

    const largura = Math.max(largura_conteiner, largura_minima);

    const layout = useMemo(() => {
        if (!nos || !links) return null;
        return calcular_layout(nos, links, {
            largura: largura - margem.esquerda - margem.direita,
            altura: altura_total - margem.topo - margem.base,
            largura_no,
            espaco_vertical: 14,
        });
    }, [nos, links, largura]);

    const receita_liquida = layout?.nos.find((no) => no.cod_no === "receita_liquida")?.valor ?? null;
    const rotulos = useMemo(() => (layout ? posicoes_rotulos(layout.nos) : new Map<string, number>()), [layout]);

    function mostrar_dica(evento: MouseEvent, conteudo: Omit<Dica, "x" | "y">) {
        const caixa = conteiner.current?.getBoundingClientRect();
        if (!caixa || !conteiner.current) return;
        definir_dica({
            ...conteudo,
            x: evento.clientX - caixa.left + conteiner.current.scrollLeft,
            y: evento.clientY - caixa.top,
        });
    }

    function pct_receita(valor: number): string {
        return receita_liquida ? `${percentual(valor / receita_liquida)} da receita líquida` : "–";
    }

    function linhas_variacao(valor_aa: number | null, var_pct: number | null): [string, string][] {
        if (valor_aa === null) return [["vs ano anterior", "sem base"]];
        return [
            ["Ano anterior", formatar(valor_aa, formatos.moeda)],
            ["Variação", formatar(var_pct, formatos.variacao_pct)],
        ];
    }

    function ativo(link: LinkLayout): boolean {
        if (!destaque) return false;
        if (destaque.link) return destaque.link === link.id;
        return link.source.cod_no === destaque.no || link.target.cod_no === destaque.no;
    }

    function teclado_no(evento: KeyboardEvent, no: NoLayout) {
        if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault();
            ao_selecionar_no(no);
        }
    }

    let conteudo: ReactNode;
    if (erro) {
        conteudo = <EstadoErro erro={erro} />;
    } else if (carregando && !layout) {
        conteudo = <Esqueleto className="h-full w-full" />;
    } else if (!layout || layout.links.length === 0) {
        conteudo = <EstadoVazio mensagem="Sem valores da DRE para este recorte." />;
    } else {
        conteudo = (
            <svg
                width={largura}
                height={altura_total}
                viewBox={`0 0 ${largura} ${altura_total}`}
                role="img"
                aria-label="Sankey da DRE: da receita bruta ao lucro líquido"
                className={cn("block transition-opacity duration-300 ease-out", carregando && "opacity-60")}
                onMouseLeave={() => {
                    definir_destaque(null);
                    definir_dica(null);
                }}
            >
                <defs>
                    {layout.links.map((link) => (
                        <linearGradient
                            key={link.id}
                            id={`grad_${link.id}`}
                            gradientUnits="userSpaceOnUse"
                            x1={link.source.x1}
                            x2={link.target.x0}
                            y1={0}
                            y2={0}
                        >
                            <stop offset="0%" stopColor={cor_no(link.source)} />
                            <stop offset="100%" stopColor={cor_no(link.target)} />
                        </linearGradient>
                    ))}
                    <pattern id="listras_prejuizo" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <rect width="8" height="8" fill={paleta_graficos.prejuizo} />
                        <rect width="3" height="8" fill="#FFFFFF" fillOpacity={0.35} />
                    </pattern>
                </defs>

                <g transform={`translate(${margem.esquerda},${margem.topo})`}>
                    <g key={chave_recorte} style={{ filter: "drop-shadow(0 0 6px rgba(0, 229, 255, 0.22))" }}>
                        {layout.links.map((link) => {
                            const prejuizo = link.tipo_link === "prejuizo";
                            const opacidade = ativo(link) ? 0.85 : destaque ? 0.18 : 0.35;
                            const titulo = `${link.source.nome_no} → ${link.target.nome_no}`;
                            const ao_entrar = (evento: MouseEvent) => {
                                definir_destaque({ link: link.id });
                                mostrar_dica(evento, {
                                    titulo,
                                    prejuizo,
                                    linhas: [
                                        ["Valor", formatar(link.valor, formatos.moeda)],
                                        ["Participação", pct_receita(link.valor)],
                                        ...linhas_variacao(link.valor_aa, link.var_aa_pct),
                                    ],
                                });
                            };
                            return (
                                <g key={link.id}>
                                    <path
                                        d={caminho(link)}
                                        pathLength={1}
                                        fill="none"
                                        stroke={prejuizo ? paleta_graficos.prejuizo : `url(#grad_${link.id})`}
                                        strokeWidth={Math.max(1, link.width)}
                                        strokeOpacity={opacidade}
                                        className="sankey_link sankey_link_entrada"
                                        style={{ animationDelay: `${link.source.coluna * 70}ms` }}
                                        onMouseEnter={ao_entrar}
                                        onMouseMove={ao_entrar}
                                    >
                                        <title>{`${titulo}: ${abreviar_moeda(link.valor)}`}</title>
                                    </path>
                                    {prejuizo && (
                                        <path
                                            d={caminho(link)}
                                            fill="none"
                                            stroke="url(#listras_prejuizo)"
                                            strokeWidth={Math.max(1, link.width)}
                                            className="sankey_pulso pointer-events-none"
                                            strokeOpacity={0.55}
                                        />
                                    )}
                                </g>
                            );
                        })}
                    </g>

                    {layout.nos.map((no) => {
                        const cor = cor_no(no);
                        const selecionado = no_selecionado === no.cod_no;
                        const prejuizo = no.tipo_no === "prejuizo";
                        const y_rotulo = rotulos.get(no.cod_no) ?? no.y0;
                        const descricao = `${no.nome_no}: ${formatar(no.valor, formatos.moeda)}`;
                        const ao_entrar = (evento: MouseEvent) => {
                            definir_destaque({ no: no.cod_no });
                            const var_pct = no.valor_aa ? (no.valor - no.valor_aa) / Math.abs(no.valor_aa) : null;
                            mostrar_dica(evento, {
                                titulo: no.nome_no,
                                prejuizo,
                                linhas: [
                                    ["Valor", formatar(no.valor, formatos.moeda)],
                                    ["Participação", pct_receita(no.valor)],
                                    ...linhas_variacao(no.valor_aa, var_pct),
                                    ["", "clique para ver a evolução mensal"],
                                ],
                            });
                        };
                        return (
                            <g
                                key={no.cod_no}
                                role="button"
                                tabIndex={0}
                                aria-label={`${descricao}. Abrir evolução mensal`}
                                aria-pressed={selecionado}
                                className="cursor-pointer focus:outline-none [&:focus-visible>rect]:stroke-ciano"
                                onClick={() => ao_selecionar_no(no)}
                                onKeyDown={(evento) => teclado_no(evento, no)}
                                onMouseEnter={ao_entrar}
                                onMouseMove={ao_entrar}
                            >
                                <rect
                                    x={no.x0}
                                    y={no.y0}
                                    width={no.x1 - no.x0}
                                    height={Math.max(1.5, no.y1 - no.y0)}
                                    rx={3}
                                    fill={cor}
                                    stroke={selecionado ? "#FFFFFF" : "transparent"}
                                    strokeWidth={2}
                                    style={{ filter: `drop-shadow(0 0 8px ${cor}88)` }}
                                />
                                <text
                                    x={no.x1 + 8}
                                    y={y_rotulo + 12}
                                    className="font-base"
                                    fontSize={12}
                                    fontWeight={600}
                                    fill={prejuizo ? paleta_graficos.prejuizo : paleta_graficos.texto}
                                    stroke="#05070F"
                                    strokeWidth={3}
                                    paintOrder="stroke"
                                >
                                    {no.nome_no}
                                </text>
                                <text
                                    x={no.x1 + 8}
                                    y={y_rotulo + 26}
                                    className="numero"
                                    fontSize={11}
                                    fill={paleta_graficos.texto_suave}
                                    stroke="#05070F"
                                    strokeWidth={3}
                                    paintOrder="stroke"
                                >
                                    {abreviar_moeda(no.valor)}
                                    {receita_liquida ? ` · ${percentual(no.valor / receita_liquida)}` : ""}
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>
        );
    }

    return (
        <div ref={conteiner} className="relative w-full overflow-x-auto overflow-y-hidden" style={{ height: altura_total }}>
            {conteudo}
            {dica && (
                <div
                    role="tooltip"
                    className={cn(
                        "pointer-events-none absolute z-20 min-w-56 rounded-xl border bg-popover p-3 text-200 shadow-28 backdrop-blur-md",
                        dica.prejuizo ? "border-rosa-neon/60" : "border-input",
                    )}
                    style={{
                        left: Math.min(dica.x + 14, largura - 260),
                        top: Math.min(dica.y + 14, altura_total - 140),
                    }}
                >
                    <p className={cn("mb-1.5 font-semibold", dica.prejuizo ? "text-rosa-neon" : "text-foreground")}>
                        {dica.titulo}
                    </p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                        {dica.linhas.map(([rotulo, valor], i) =>
                            rotulo ? (
                                <div key={i} className="contents">
                                    <dt className="text-muted-foreground">{rotulo}</dt>
                                    <dd className="numero text-right text-foreground">{valor}</dd>
                                </div>
                            ) : (
                                <dd key={i} className="col-span-2 mt-1 text-texto-fraco">{valor}</dd>
                            ),
                        )}
                    </dl>
                </div>
            )}
        </div>
    );
}
