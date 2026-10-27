// Página principal: lê as dimensões, mantém os filtros e dispara as consultas em
// paralelo (uma por resultado, sem duplicar), repassando cada resultado ao seu visual.
// Filtragem cruzada como no Power BI: clicar num mês (tendência, evolução do nó) ou numa
// região filtra os demais visuais; Ctrl+clique soma pontos; Esc ou o botão da barra limpa.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { InteractionEvent } from "@microsoft/fabric-visuals-core";

import { numero, texto, useConsulta, type Linha } from "@/dados/cliente_modelo";
import {
    cenarios,
    meses_do_intervalo,
    meses_selecionados,
    regioes_filtradas,
    regioes_selecionadas,
    type Cenario,
    type DominioFiltros,
} from "@/dados/construtor_filtros";
import {
    q_anos,
    q_calendario,
    q_carga,
    q_cenarios,
    q_detalhe_no,
    q_dre,
    q_dre_subtotais,
    q_kpis,
    q_meses,
    q_operacional,
    q_regioes,
    q_regioes_lista,
    q_sankey_links,
    q_sankey_nos,
    q_tendencia,
    type ContextoConsulta,
} from "@/dados/consultas_dax";
import { formatos, type Formato } from "@/dados/formatacao";
import { no_so_de_saida, type LinkSankeyEntrada, type NoSankeyEntrada } from "@/dados/layout_sankey";
import { filtros_padrao, useEstadoFiltros } from "@/estado/estado_filtros";
import { valores_da_interacao } from "@/estado/selecao_cruzada";
import { cor_por_tipo_no, usePaletaGraficos, type PaletaGraficos } from "@/tema/tema_graficos";
import { BarraFiltros, type OpcoesBarraFiltros } from "./componentes/barra_filtros";
import { CabecalhoApp } from "./componentes/cabecalho_app";
import { CartaoKpi } from "./componentes/cartao_kpi";
import { Cartao, EstadoErro, EstadoCarregando } from "./componentes/estados_carregamento";
import { GraficoRegioes } from "./componentes/grafico_regioes";
import { GraficoSankey } from "./componentes/grafico_sankey";
import { GraficoTendencia, Legenda } from "./componentes/grafico_tendencia";
import { PainelDetalheNo } from "./componentes/painel_detalhe_no";
import { PainelOperacional } from "./componentes/painel_operacional";
import { TabelaDre } from "./componentes/tabela_dre";

/** Uma chave órfã na fato cria um membro em branco na dimensão: descartar chaves vazias. */
function sem_vazios(linhas: Linha[] | undefined, chave: string): Linha[] {
    return (linhas ?? []).filter((l) => texto(l, chave) !== "");
}

interface DefinicaoKpi {
    titulo: string;
    campo: string;
    formato: Formato;
    campo_variacao: string;
    formato_variacao: Formato;
    rotulo_variacao: string;
    campo_serie: string;
    cor: keyof PaletaGraficos;
}

const kpis: DefinicaoKpi[] = [
    {
        titulo: "Receita líquida",
        campo: "receita_liquida",
        formato: formatos.moeda,
        campo_variacao: "var_receita_liquida_aa_pct",
        formato_variacao: formatos.variacao_pct,
        rotulo_variacao: "vs ano anterior",
        campo_serie: "receita_liquida",
        cor: "receita",
    },
    {
        titulo: "Lucro bruto",
        campo: "lucro_bruto",
        formato: formatos.moeda,
        campo_variacao: "var_lucro_bruto_aa_pct",
        formato_variacao: formatos.variacao_pct,
        rotulo_variacao: "vs ano anterior",
        campo_serie: "lucro_bruto",
        cor: "lucro",
    },
    {
        titulo: "EBITDA",
        campo: "ebitda",
        formato: formatos.moeda,
        campo_variacao: "var_ebitda_aa_pct",
        formato_variacao: formatos.variacao_pct,
        rotulo_variacao: "vs ano anterior",
        campo_serie: "ebitda",
        cor: "lucro",
    },
    {
        titulo: "Lucro líquido",
        campo: "lucro_liquido",
        formato: formatos.moeda,
        campo_variacao: "var_lucro_liquido_aa_pct",
        formato_variacao: formatos.variacao_pct,
        rotulo_variacao: "vs ano anterior",
        campo_serie: "lucro_liquido",
        cor: "lucro",
    },
    {
        titulo: "Margem líquida",
        campo: "margem_liquida",
        formato: formatos.percentual,
        campo_variacao: "var_margem_liquida_aa_pp",
        formato_variacao: formatos.variacao_pp,
        rotulo_variacao: "vs ano anterior",
        campo_serie: "margem_liquida",
        cor: "total",
    },
    {
        titulo: "Lucro líquido vs orçado",
        campo: "var_lucro_liquido_orcado_pct",
        formato: formatos.variacao_pct,
        campo_variacao: "var_receita_liquida_orcado_pct",
        formato_variacao: formatos.variacao_pct,
        rotulo_variacao: "receita vs orçado",
        campo_serie: "var_lucro_liquido_orcado_pct",
        cor: "total",
    },
];

export function PaginaPrincipal() {
    const paleta = usePaletaGraficos();

    // dimensões e metadados (consultas fixas, disparadas juntas na abertura)
    const anos = useConsulta(q_anos);
    const calendario = useConsulta(q_calendario);
    const meses = useConsulta(q_meses);
    const regioes_lista = useConsulta(q_regioes_lista);
    const cenarios_lista = useConsulta(q_cenarios);
    const nos = useConsulta(q_sankey_nos);
    const carga = useConsulta(q_carga);

    const dominio = useMemo<DominioFiltros | undefined>(() => {
        if (!anos.linhas || !regioes_lista.linhas || !calendario.linhas) return undefined;
        return {
            anos: anos.linhas.map((l) => numero(l, "ano")).filter((a): a is number => a !== null),
            regioes: sem_vazios(regioes_lista.linhas, "cod_regiao").map((l) => texto(l, "cod_regiao")),
            indices_mes: calendario.linhas.map((l) => numero(l, "indice_mes")).filter((i): i is number => i !== null),
        };
    }, [anos.linhas, regioes_lista.linhas, calendario.linhas]);

    /** indice_mes → "Mar/2025", para o rótulo da seleção cruzada. */
    const rotulos_mes = useMemo(
        () => new Map((calendario.linhas ?? []).map((l) => [numero(l, "indice_mes"), texto(l, "mes_ano")])),
        [calendario.linhas],
    );

    const opcoes = useMemo<OpcoesBarraFiltros | undefined>(() => {
        if (!dominio || !meses.linhas || !cenarios_lista.linhas) return undefined;
        return {
            anos: dominio.anos,
            meses: sem_vazios(meses.linhas, "mes").map((l) => ({ mes: numero(l, "mes") ?? 0, nome_mes: texto(l, "nome_mes") })),
            regioes: sem_vazios(regioes_lista.linhas, "cod_regiao").map((l) => ({
                cod_regiao: texto(l, "cod_regiao"),
                nome_regiao: texto(l, "nome_regiao"),
                ufs: texto(l, "ufs"),
            })),
            cenarios: sem_vazios(cenarios_lista.linhas, "cod_cenario")
                .filter((l) => (cenarios as readonly string[]).includes(texto(l, "cod_cenario")))
                .map((l) => ({ cod_cenario: texto(l, "cod_cenario") as Cenario, nome_cenario: texto(l, "nome_cenario") })),
        };
    }, [dominio, meses.linhas, regioes_lista.linhas, cenarios_lista.linhas]);

    const [filtros, acoes, versoes] = useEstadoFiltros(dominio);
    const ctx = useMemo<ContextoConsulta | undefined>(
        () => (filtros && dominio ? { filtros, dominio } : undefined),
        [filtros, dominio],
    );

    // recortes derivados do estado, memorizados para não recompilar os specs a cada render
    const recortes = useMemo(
        () =>
            ctx
                ? {
                    intervalo: meses_do_intervalo(ctx.filtros),
                    meses_sel: meses_selecionados(ctx.filtros, ctx.dominio),
                    regioes_filtro: regioes_filtradas(ctx.filtros, ctx.dominio),
                    regioes_sel: regioes_selecionadas(ctx.filtros, ctx.dominio),
                }
                : undefined,
        [ctx],
    );

    const nos_sankey = useMemo<NoSankeyEntrada[] | undefined>(
        () =>
            nos.linhas
                ? sem_vazios(nos.linhas, "cod_no").map((l) => ({
                    cod_no: texto(l, "cod_no"),
                    nome_no: texto(l, "nome_no"),
                    tipo_no: texto(l, "tipo_no"),
                    coluna_sankey: numero(l, "coluna_sankey") ?? 0,
                    cor_hex: texto(l, "cor_hex"),
                }))
                : undefined,
        [nos.linhas],
    );

    const [cod_no_selecionado, selecionar_no] = useState<string | null>(null);
    const no_selecionado = nos_sankey?.find((no) => no.cod_no === cod_no_selecionado);

    // Sankey em tela cheia: o cartão cobre a janela do app (o portal do Fabric roda o app num
    // iframe) e, se o navegador permitir, a página entra em tela cheia de verdade
    const [sankey_expandido, expandir_sankey] = useState(false);
    useEffect(() => {
        if (!sankey_expandido) return;
        document.documentElement.requestFullscreen?.().catch(() => undefined);
        const overflow_anterior = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const ao_teclar = (evento: KeyboardEvent) => {
            if (evento.key === "Escape") expandir_sankey(false);
        };
        // o Esc da tela cheia do navegador não chega ao keydown: sair dela também fecha o cartão
        const ao_sair_tela_cheia = () => {
            if (!document.fullscreenElement) expandir_sankey(false);
        };
        window.addEventListener("keydown", ao_teclar);
        document.addEventListener("fullscreenchange", ao_sair_tela_cheia);
        return () => {
            window.removeEventListener("keydown", ao_teclar);
            document.removeEventListener("fullscreenchange", ao_sair_tela_cheia);
            document.body.style.overflow = overflow_anterior;
            if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
        };
    }, [sankey_expandido]);

    // Esc limpa a seleção cruzada, como clicar no fundo do visual de origem
    // (com o Sankey em tela cheia, o Esc só fecha a tela cheia)
    const tem_selecao = Boolean(filtros?.selecao);
    useEffect(() => {
        if (!tem_selecao || sankey_expandido) return;
        const ao_teclar = (evento: KeyboardEvent) => {
            if (evento.key === "Escape") acoes.limpar_selecao();
        };
        window.addEventListener("keydown", ao_teclar);
        return () => window.removeEventListener("keydown", ao_teclar);
    }, [tem_selecao, sankey_expandido, acoes]);

    // consultas filtradas: cada uma uma vez, todas em paralelo
    const kpi = useConsulta(ctx ? q_kpis(ctx) : null);
    const tendencia = useConsulta(ctx ? q_tendencia(ctx) : null);
    const regioes = useConsulta(ctx ? q_regioes(ctx) : null);
    const links = useConsulta(ctx ? q_sankey_links(ctx) : null);
    const dre = useConsulta(ctx ? q_dre(ctx) : null);
    const dre_subtotais = useConsulta(ctx ? q_dre_subtotais(ctx) : null);
    const operacional = useConsulta(ctx ? q_operacional(ctx) : null);
    const detalhe = useConsulta(
        ctx && no_selecionado && nos_sankey
            ? q_detalhe_no(
                ctx,
                no_selecionado.cod_no,
                nos_sankey.map((no) => no.cod_no),
                no_so_de_saida(no_selecionado.tipo_no),
            )
            : null,
    );

    const links_sankey = useMemo<LinkSankeyEntrada[] | undefined>(
        () =>
            links.linhas?.map((l) => ({
                cod_no_origem: texto(l, "cod_no_origem"),
                cod_no_destino: texto(l, "cod_no_destino"),
                tipo_link: texto(l, "tipo_link"),
                valor: numero(l, "valor") ?? 0,
                valor_aa: numero(l, "valor_aa"),
                var_aa_pct: numero(l, "var_aa_pct"),
            })),
        [links.linhas],
    );

    const erro_dimensoes = anos.erro ?? calendario.erro ?? meses.erro ?? regioes_lista.erro ?? cenarios_lista.erro ?? nos.erro;

    if (erro_dimensoes) {
        return (
            <Moldura carga={carga}>
                <EstadoErro erro={erro_dimensoes} titulo="Não foi possível ler as dimensões do modelo blacksmith_dre" />
            </Moldura>
        );
    }

    if (!filtros || !opcoes || !dominio || !ctx || !recortes) {
        return (
            <Moldura carga={carga}>
                <EstadoCarregando className="h-96" rotulo="Lendo as dimensões do modelo…" />
            </Moldura>
        );
    }

    /** Clique num visual por mês: só meses do calendário e do intervalo da barra filtram. */
    const interagir_meses = (origem: string) => (eventos: InteractionEvent[]) => {
        const valores = valores_da_interacao(eventos, "indice_mes");
        if (valores === null) {
            acoes.limpar_selecao(origem);
            return;
        }
        const validos = valores.filter(
            (v): v is number =>
                typeof v === "number"
                && (dominio.indices_mes ?? []).includes(v)
                && (recortes.intervalo === null || recortes.intervalo.includes(((v - 1) % 12) + 1)),
        );
        acoes.selecionar({ origem, campo: "indice_mes", valores: validos });
    };

    /** Clique no gráfico de regiões: só regiões do filtro da barra filtram. */
    const interagir_regioes = (eventos: InteractionEvent[]) => {
        const valores = valores_da_interacao(eventos, "cod_regiao");
        if (valores === null) {
            acoes.limpar_selecao("regioes");
            return;
        }
        const validos = valores.filter(
            (v): v is string =>
                typeof v === "string"
                && dominio.regioes.includes(v)
                && (recortes.regioes_filtro === null || recortes.regioes_filtro.includes(v)),
        );
        acoes.selecionar({ origem: "regioes", campo: "cod_regiao", valores: validos });
    };

    const rotulo_selecao = recortes.meses_sel
        ? recortes.meses_sel.map((i) => rotulos_mes.get(i) ?? String(i)).join(", ")
        : recortes.regioes_sel
            ? recortes.regioes_sel.map((cod) => opcoes.regioes.find((r) => r.cod_regiao === cod)?.nome_regiao ?? cod).join(", ")
            : null;

    const linha_kpi = kpi.linhas?.[0];
    const serie_12 = (tendencia.linhas ?? []).slice(-12);
    const prejuizo = (numero(linha_kpi, "prejuizo_liquido") ?? 0) > 0;
    const descrever = (omitir?: OmitirRecorte) => descrever_recorte(ctx, opcoes, rotulos_mes, omitir);
    const recorte = descrever();
    const recorte_sem_mes = descrever({ sem_mes: true });
    const recorte_sem_regiao = descrever({ sem_regiao: true });
    const recorte_sem_cenario = descrever({ sem_cenario: true });

    return (
        <Moldura carga={carga}>
            <BarraFiltros
                filtros={filtros}
                acoes={acoes}
                opcoes={opcoes}
                padrao={filtros_padrao(dominio)}
                rotulo_selecao={rotulo_selecao}
            />

            <section aria-label="Indicadores principais" className="grid grid-cols-2 gap-grid md:grid-cols-3 xl:grid-cols-6">
                {kpis.map((definicao) => (
                    <CartaoKpi
                        key={definicao.campo}
                        titulo={definicao.titulo}
                        valor={numero(linha_kpi, definicao.campo)}
                        formato={definicao.formato}
                        variacao={numero(linha_kpi, definicao.campo_variacao)}
                        formato_variacao={definicao.formato_variacao}
                        rotulo_variacao={definicao.rotulo_variacao}
                        serie={serie_12.map((l) => numero(l, definicao.campo_serie))}
                        cor={definicao.campo === "lucro_liquido" && prejuizo ? paleta.prejuizo : paleta[definicao.cor]}
                        carregando={kpi.carregando && !linha_kpi}
                        prejuizo={definicao.campo === "lucro_liquido" && prejuizo}
                    />
                ))}
            </section>
            {kpi.erro && <EstadoErro erro={kpi.erro} titulo="Não foi possível calcular os indicadores" />}

            <Cartao
                titulo="Do faturamento ao lucro"
                subtitulo={`${recorte} · clique num nó para destacar os fluxos e ver a evolução mensal`}
                className={sankey_expandido ? "fixed inset-0 z-50 overflow-hidden" : undefined}
                acoes={
                    <div className="flex items-center gap-4">
                        <Legenda
                            itens={[
                                { rotulo: "Receitas", cor: paleta.receita },
                                { rotulo: "Totais", cor: paleta.total },
                                { rotulo: "Custos e despesas", cor: paleta.custo },
                                { rotulo: "Lucros", cor: paleta.lucro },
                                { rotulo: "Prejuízo", cor: paleta.prejuizo },
                            ]}
                        />
                        <button
                            type="button"
                            onClick={() => expandir_sankey((atual) => !atual)}
                            aria-label={sankey_expandido ? "Sair da tela cheia" : "Expandir o Sankey em tela cheia"}
                            aria-pressed={sankey_expandido}
                            title={sankey_expandido ? "Sair da tela cheia (Esc)" : "Tela cheia"}
                            className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {sankey_expandido ? (
                                <Minimize2 className="icon-size-300" aria-hidden="true" />
                            ) : (
                                <Maximize2 className="icon-size-300" aria-hidden="true" />
                            )}
                        </button>
                    </div>
                }
            >
                <GraficoSankey
                    nos={nos_sankey}
                    links={links_sankey}
                    carregando={links.carregando || nos.carregando}
                    erro={links.erro}
                    chave_recorte={JSON.stringify(filtros)}
                    no_selecionado={cod_no_selecionado}
                    ao_selecionar_no={(no) => selecionar_no((atual) => (atual === no.cod_no ? null : no.cod_no))}
                    expandido={sankey_expandido}
                />
            </Cartao>

            {no_selecionado && (
                <PainelDetalheNo
                    key={`detalhe_no_${no_selecionado.cod_no}_${versoes.detalhe_no ?? 0}`}
                    nome_no={no_selecionado.nome_no}
                    cor={cor_por_tipo_no(paleta, no_selecionado.tipo_no)}
                    tabela={detalhe.tabela}
                    carregando={detalhe.carregando}
                    erro={detalhe.erro}
                    subtitulo={recorte_sem_mes}
                    selecionados={recortes.meses_sel}
                    ao_interagir={interagir_meses("detalhe_no")}
                    ao_fechar={() => selecionar_no(null)}
                />
            )}

            <div className="grid grid-cols-1 gap-grid lg:grid-cols-12">
                <GraficoTendencia
                    key={`tendencia_${versoes.tendencia ?? 0}`}
                    tabela={tendencia.tabela}
                    carregando={tendencia.carregando}
                    erro={tendencia.erro}
                    subtitulo={recorte_sem_mes}
                    intervalo={recortes.intervalo}
                    selecionados={recortes.meses_sel}
                    ao_interagir={interagir_meses("tendencia")}
                    className="lg:col-span-8"
                />
                <GraficoRegioes
                    key={`regioes_${versoes.regioes ?? 0}`}
                    tabela={regioes.tabela}
                    carregando={regioes.carregando}
                    erro={regioes.erro}
                    no_filtro={recortes.regioes_filtro}
                    selecionadas={recortes.regioes_sel}
                    ao_interagir={interagir_regioes}
                    subtitulo={recorte_sem_regiao}
                    className="lg:col-span-4"
                />
                <TabelaDre
                    contas={dre.linhas}
                    subtotais={dre_subtotais.linhas}
                    carregando={dre.carregando || dre_subtotais.carregando}
                    erro={dre.erro ?? dre_subtotais.erro}
                    subtitulo={recorte_sem_cenario}
                    className="lg:col-span-8"
                />
                <PainelOperacional
                    linha={operacional.linhas?.[0]}
                    carregando={operacional.carregando}
                    erro={operacional.erro}
                    subtitulo={recorte_sem_cenario}
                    cenario_orcado={filtros.cenario === "orcado"}
                    className="lg:col-span-4"
                />
            </div>

            <footer className="pb-8 pt-2 text-center text-200 text-texto-fraco">
                Blacksmith é uma empresa fictícia: dados 100% sintéticos (seed 42).
            </footer>
        </Moldura>
    );
}

function Moldura({ carga, children }: { carga: ReturnType<typeof useConsulta>; children: ReactNode }) {
    return (
        <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-grid px-4">
            <CabecalhoApp
                data_ultima_carga={carga.linhas?.[0]?.["data_ultima_carga"]}
                carregando={carga.carregando}
                erro={carga.erro}
            />
            {children}
        </main>
    );
}

interface OmitirRecorte {
    sem_mes?: boolean;
    sem_regiao?: boolean;
    sem_cenario?: boolean;
}

/**
 * Texto do recorte filtrado, para os subtítulos ("2025 · Mar a Abr · Sudeste · Realizado").
 * A seleção cruzada aparece no lugar do filtro que ela refina, e some dos visuais que a originam.
 */
function descrever_recorte(
    ctx: ContextoConsulta,
    opcoes: OpcoesBarraFiltros,
    rotulos_mes: Map<number | null, string>,
    omitir: OmitirRecorte = {},
): string {
    const { filtros, dominio } = ctx;
    const partes = [filtros.ano === null ? "Todos os anos" : String(filtros.ano)];
    if (!omitir.sem_mes) {
        const selecionados = meses_selecionados(filtros, dominio);
        const meses = meses_do_intervalo(filtros);
        if (selecionados) {
            partes.push(`seleção: ${selecionados.map((i) => rotulos_mes.get(i) ?? String(i)).join(", ")}`);
        } else if (meses) {
            const nome = (mes: number) => opcoes.meses.find((m) => m.mes === mes)?.nome_mes ?? String(mes);
            partes.push(meses.length === 1 ? nome(meses[0]) : `${nome(meses[0])} a ${nome(meses[meses.length - 1])}`);
        }
    }
    if (!omitir.sem_regiao) {
        const nome = (cod: string) => opcoes.regioes.find((r) => r.cod_regiao === cod)?.nome_regiao ?? cod;
        const selecionadas = regioes_selecionadas(filtros, dominio);
        const regioes = regioes_filtradas(filtros, dominio);
        partes.push(
            selecionadas
                ? `seleção: ${selecionadas.map(nome).join(", ")}`
                : regioes
                    ? regioes.map(nome).join(", ")
                    : "Todas as regiões",
        );
    }
    if (!omitir.sem_cenario) {
        partes.push(opcoes.cenarios.find((c) => c.cod_cenario === filtros.cenario)?.nome_cenario ?? filtros.cenario);
    }
    return partes.join(" · ");
}
