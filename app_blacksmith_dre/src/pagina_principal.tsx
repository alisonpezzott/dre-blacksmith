// Página principal: lê as dimensões, mantém os filtros e dispara as consultas em
// paralelo (uma por resultado, sem duplicar), repassando cada resultado ao seu visual.

import { useMemo, useState, type ReactNode } from "react";

import { numero, texto, useConsulta, type Linha } from "@/dados/cliente_modelo";
import { cenarios, meses_do_intervalo, regioes_filtradas, type Cenario, type DominioFiltros } from "@/dados/construtor_filtros";
import {
    q_anos,
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
import { paleta_graficos } from "@/tema/tema_graficos";
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

/** O Direct Lake acrescenta um membro em branco às dimensões: descartar chaves vazias. */
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
    cor: string;
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
        cor: paleta_graficos.receita,
    },
    {
        titulo: "Lucro bruto",
        campo: "lucro_bruto",
        formato: formatos.moeda,
        campo_variacao: "var_lucro_bruto_aa_pct",
        formato_variacao: formatos.variacao_pct,
        rotulo_variacao: "vs ano anterior",
        campo_serie: "lucro_bruto",
        cor: paleta_graficos.lucro,
    },
    {
        titulo: "EBITDA",
        campo: "ebitda",
        formato: formatos.moeda,
        campo_variacao: "var_ebitda_aa_pct",
        formato_variacao: formatos.variacao_pct,
        rotulo_variacao: "vs ano anterior",
        campo_serie: "ebitda",
        cor: paleta_graficos.lucro,
    },
    {
        titulo: "Lucro líquido",
        campo: "lucro_liquido",
        formato: formatos.moeda,
        campo_variacao: "var_lucro_liquido_aa_pct",
        formato_variacao: formatos.variacao_pct,
        rotulo_variacao: "vs ano anterior",
        campo_serie: "lucro_liquido",
        cor: paleta_graficos.lucro,
    },
    {
        titulo: "Margem líquida",
        campo: "margem_liquida",
        formato: formatos.percentual,
        campo_variacao: "var_margem_liquida_aa_pp",
        formato_variacao: formatos.variacao_pp,
        rotulo_variacao: "vs ano anterior",
        campo_serie: "margem_liquida",
        cor: paleta_graficos.total,
    },
    {
        titulo: "Lucro líquido vs orçado",
        campo: "var_lucro_liquido_orcado_pct",
        formato: formatos.variacao_pct,
        campo_variacao: "var_receita_liquida_orcado_pct",
        formato_variacao: formatos.variacao_pct,
        rotulo_variacao: "receita vs orçado",
        campo_serie: "var_lucro_liquido_orcado_pct",
        cor: paleta_graficos.total,
    },
];

export function PaginaPrincipal() {
    // dimensões e metadados (consultas fixas, disparadas juntas na abertura)
    const anos = useConsulta(q_anos);
    const meses = useConsulta(q_meses);
    const regioes_lista = useConsulta(q_regioes_lista);
    const cenarios_lista = useConsulta(q_cenarios);
    const nos = useConsulta(q_sankey_nos);
    const carga = useConsulta(q_carga);

    const dominio = useMemo<DominioFiltros | undefined>(() => {
        if (!anos.linhas || !regioes_lista.linhas) return undefined;
        return {
            anos: anos.linhas.map((l) => numero(l, "ano")).filter((a): a is number => a !== null),
            regioes: sem_vazios(regioes_lista.linhas, "cod_regiao").map((l) => texto(l, "cod_regiao")),
        };
    }, [anos.linhas, regioes_lista.linhas]);

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

    const [filtros, acoes] = useEstadoFiltros(dominio);
    const ctx = useMemo<ContextoConsulta | undefined>(
        () => (filtros && dominio ? { filtros, dominio } : undefined),
        [filtros, dominio],
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

    const erro_dimensoes = anos.erro ?? meses.erro ?? regioes_lista.erro ?? cenarios_lista.erro ?? nos.erro;

    if (erro_dimensoes) {
        return (
            <Moldura carga={carga}>
                <EstadoErro erro={erro_dimensoes} titulo="Não foi possível ler as dimensões do modelo sm_blacksmith_dre" />
            </Moldura>
        );
    }

    if (!filtros || !opcoes || !dominio || !ctx) {
        return (
            <Moldura carga={carga}>
                <EstadoCarregando className="h-96" rotulo="Lendo as dimensões do modelo…" />
            </Moldura>
        );
    }

    const linha_kpi = kpi.linhas?.[0];
    const serie_12 = (tendencia.linhas ?? []).slice(-12);
    const prejuizo = (numero(linha_kpi, "prejuizo_liquido") ?? 0) > 0;
    const recorte = descrever_recorte(ctx, opcoes);
    const recorte_sem_mes = descrever_recorte(ctx, opcoes, { sem_mes: true });
    const recorte_sem_regiao = descrever_recorte(ctx, opcoes, { sem_regiao: true });
    const recorte_sem_cenario = descrever_recorte(ctx, opcoes, { sem_cenario: true });

    return (
        <Moldura carga={carga}>
            <BarraFiltros filtros={filtros} acoes={acoes} opcoes={opcoes} padrao={filtros_padrao(dominio)} />

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
                        cor={definicao.campo === "lucro_liquido" && prejuizo ? paleta_graficos.prejuizo : definicao.cor}
                        carregando={kpi.carregando && !linha_kpi}
                        prejuizo={definicao.campo === "lucro_liquido" && prejuizo}
                    />
                ))}
            </section>
            {kpi.erro && <EstadoErro erro={kpi.erro} titulo="Não foi possível calcular os indicadores" />}

            <Cartao
                titulo="Do faturamento ao lucro"
                subtitulo={`${recorte} · clique num nó para ver a evolução mensal`}
                destaque
                acoes={
                    <Legenda
                        itens={[
                            { rotulo: "Receitas", cor: paleta_graficos.receita },
                            { rotulo: "Totais", cor: paleta_graficos.total },
                            { rotulo: "Custos e despesas", cor: paleta_graficos.custo },
                            { rotulo: "Lucros", cor: paleta_graficos.lucro },
                            { rotulo: "Prejuízo", cor: paleta_graficos.prejuizo },
                        ]}
                    />
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
                />
            </Cartao>

            {no_selecionado && (
                <PainelDetalheNo
                    nome_no={no_selecionado.nome_no}
                    cor={no_selecionado.cor_hex || paleta_graficos.total}
                    tabela={detalhe.tabela}
                    carregando={detalhe.carregando}
                    erro={detalhe.erro}
                    subtitulo={recorte_sem_mes}
                    ao_fechar={() => selecionar_no(null)}
                />
            )}

            <div className="grid grid-cols-1 gap-grid lg:grid-cols-12">
                <GraficoTendencia
                    tabela={tendencia.tabela}
                    carregando={tendencia.carregando}
                    erro={tendencia.erro}
                    subtitulo={recorte_sem_mes}
                    className="lg:col-span-8"
                />
                <GraficoRegioes
                    tabela={regioes.tabela}
                    carregando={regioes.carregando}
                    erro={regioes.erro}
                    selecionadas={regioes_filtradas(filtros, dominio)}
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

/** Texto do recorte filtrado, para os subtítulos ("2025 · Mar a Abr · Sudeste · Realizado"). */
function descrever_recorte(
    ctx: ContextoConsulta,
    opcoes: OpcoesBarraFiltros,
    omitir: { sem_mes?: boolean; sem_regiao?: boolean; sem_cenario?: boolean } = {},
): string {
    const { filtros, dominio } = ctx;
    const partes = [filtros.ano === null ? "Todos os anos" : String(filtros.ano)];
    const meses = meses_do_intervalo(filtros);
    if (!omitir.sem_mes && meses) {
        const nome = (mes: number) => opcoes.meses.find((m) => m.mes === mes)?.nome_mes ?? String(mes);
        partes.push(meses.length === 1 ? nome(meses[0]) : `${nome(meses[0])} a ${nome(meses[meses.length - 1])}`);
    }
    if (!omitir.sem_regiao) {
        const regioes = regioes_filtradas(filtros, dominio);
        partes.push(
            regioes
                ? regioes.map((cod) => opcoes.regioes.find((r) => r.cod_regiao === cod)?.nome_regiao ?? cod).join(", ")
                : "Todas as regiões",
        );
    }
    if (!omitir.sem_cenario) {
        partes.push(opcoes.cenarios.find((c) => c.cod_cenario === filtros.cenario)?.nome_cenario ?? filtros.cenario);
    }
    return partes.join(" · ");
}
