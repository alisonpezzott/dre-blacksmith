"""Recalcula a DRE e o Sankey da Blacksmith a partir dos CSVs de dataset/.

Gera validacao/referencias.json com os valores exatos que servem de gabarito para os
gates das Fases 1 a 3. Substitui as abas dre_anual e resultado_mensal do Excel, que
não está no repositório. Usa só a biblioteca padrão:

    uv run validacao/gerar_referencias.py

A cascata do Sankey replica a medida sankey_valor do modelo semântico (seção 7.3 do
CLAUDE.md). O script termina com código 1 se algum nó do Sankey não fechar.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import TypeAlias

PASTA_VALIDACAO = Path(__file__).resolve().parent
PASTA_DADOS = PASTA_VALIDACAO.parent / "dataset"
ARQUIVO_SAIDA = PASTA_VALIDACAO / "referencias.json"

ZERO = Decimal(0)
LIMIAR_LINK = Decimal("0.005")  # mesmo corte da medida sankey_valor
TOLERANCIA_NO = Decimal("0.05")  # mesma tolerância da query de validação dos nós
CENARIOS = ("realizado", "orcado")
TABELAS = (
    "dim_calendario",
    "dim_conta",
    "dim_regiao",
    "dim_no_sankey",
    "dim_link_sankey",
    "fato_lancamentos",
    "fato_operacional",
)

Linha: TypeAlias = dict[str, str]


@dataclass(frozen=True)
class Totais:
    """Somas de um recorte (cenário × período × região) dos lançamentos."""

    por_grupo: dict[str, Decimal]  # valor_dre por cod_grupo (despesa negativa)
    por_conta: dict[str, Decimal]  # valor (sempre positivo) por cod_conta


def ler_csv(tabela: str) -> list[Linha]:
    """Lê um CSV de dataset/ como lista de dicionários de texto.

    Args:
        tabela: Nome da tabela, igual ao nome do arquivo sem extensão.

    Returns:
        Uma linha por registro, com as colunas do cabeçalho como chaves.
    """
    with (PASTA_DADOS / f"{tabela}.csv").open(encoding="utf-8", newline="") as arquivo:
        return list(csv.DictReader(arquivo))


def somar(lancamentos: Iterable[Linha], grupo_da_conta: dict[str, str]) -> Totais:
    """Soma os lançamentos de um recorte por grupo da DRE e por conta.

    Args:
        lancamentos: Linhas de fato_lancamentos já filtradas pelo recorte.
        grupo_da_conta: Mapa cod_conta → cod_grupo de dim_conta.

    Returns:
        Os totais do recorte.
    """
    por_grupo: defaultdict[str, Decimal] = defaultdict(Decimal)
    por_conta: defaultdict[str, Decimal] = defaultdict(Decimal)
    for linha in lancamentos:
        por_grupo[grupo_da_conta[linha["cod_conta"]]] += Decimal(linha["valor_dre"])
        por_conta[linha["cod_conta"]] += Decimal(linha["valor"])
    return Totais(dict(por_grupo), dict(por_conta))


def calcular_dre(totais: Totais) -> dict[str, Decimal]:
    """Monta a cascata da DRE com os mesmos nomes das medidas da pasta 01_dre.

    Args:
        totais: Totais do recorte.

    Returns:
        Grupos e subtotais da DRE, com despesas negativas.
    """
    grupo = totais.por_grupo
    receita_bruta = grupo.get("receita_bruta", ZERO)
    deducoes_receita = grupo.get("deducoes_da_receita", ZERO)
    receita_liquida = receita_bruta + deducoes_receita
    custos = grupo.get("custos_cpv_csp", ZERO)
    lucro_bruto = receita_liquida + custos
    despesas_operacionais = grupo.get("despesas_operacionais", ZERO)
    ebitda = lucro_bruto + despesas_operacionais
    depreciacao_amortizacao = grupo.get("depreciacao_amortizacao", ZERO)
    ebit = ebitda + depreciacao_amortizacao
    resultado_financeiro = grupo.get("resultado_financeiro", ZERO)
    lair = ebit + resultado_financeiro
    ir_csll = grupo.get("impostos_sobre_o_lucro", ZERO)
    lucro_liquido = lair + ir_csll
    return {
        "receita_bruta": receita_bruta,
        "deducoes_receita": deducoes_receita,
        "receita_liquida": receita_liquida,
        "custos": custos,
        "lucro_bruto": lucro_bruto,
        "despesas_operacionais": despesas_operacionais,
        "ebitda": ebitda,
        "depreciacao_amortizacao": depreciacao_amortizacao,
        "ebit": ebit,
        "resultado_financeiro": resultado_financeiro,
        "lair": lair,
        "ir_csll": ir_csll,
        "lucro_liquido": lucro_liquido,
    }


def calcular_margem(numerador: Decimal, denominador: Decimal) -> Decimal | None:
    """Divide como o DIVIDE do DAX: vazio quando o denominador é zero."""
    if denominador == ZERO:
        return None
    return round(numerador / denominador, 6)


def calcular_sankey(totais: Totais, links: list[Linha]) -> dict[str, Decimal]:
    """Replica a medida sankey_valor para todos os links de dim_link_sankey.

    A receita líquida paga cada camada de gasto em cascata; a parte não coberta de
    cada gasto passa a vir do nó prejuizo_liquido.

    Args:
        totais: Totais do recorte.
        links: Linhas de dim_link_sankey em ordem_link.

    Returns:
        Valor por cod_link, só para os links acima de R$ 0,005 (os demais somem).

    Raises:
        KeyError: Se um link de subtotal ou de prejuízo não estiver na cascata.
    """
    dre = calcular_dre(totais)
    gasto_custos = -dre["custos"]
    gasto_opex = -dre["despesas_operacionais"]
    gasto_da = -dre["depreciacao_amortizacao"]
    gasto_fin = -dre["resultado_financeiro"]
    gasto_ir = -dre["ir_csll"]
    saldo_0 = dre["receita_liquida"]
    saldo_1 = max(saldo_0 - gasto_custos, ZERO)
    saldo_2 = max(saldo_1 - gasto_opex, ZERO)
    saldo_3 = max(saldo_2 - gasto_da, ZERO)
    saldo_4 = max(saldo_3 - gasto_fin, ZERO)
    saldo_5 = max(saldo_4 - gasto_ir, ZERO)
    cascata = {
        "receita_bruta__deducoes_da_receita": -dre["deducoes_receita"],
        "receita_bruta__receita_liquida": saldo_0,
        "receita_liquida__custos_cpv_csp": min(saldo_0, gasto_custos),
        "prejuizo_liquido__custos_cpv_csp": gasto_custos - min(saldo_0, gasto_custos),
        "receita_liquida__lucro_bruto": saldo_1,
        "lucro_bruto__despesas_operacionais": min(saldo_1, gasto_opex),
        "prejuizo_liquido__despesas_operacionais": gasto_opex
        - min(saldo_1, gasto_opex),
        "lucro_bruto__ebitda": saldo_2,
        "ebitda__depreciacao_amortizacao": min(saldo_2, gasto_da),
        "prejuizo_liquido__depreciacao_amortizacao": gasto_da - min(saldo_2, gasto_da),
        "ebitda__ebit_lucro_operacional": saldo_3,
        "ebit_lucro_operacional__resultado_financeiro_liquido": min(saldo_3, gasto_fin),
        "prejuizo_liquido__resultado_financeiro_liquido": gasto_fin
        - min(saldo_3, gasto_fin),
        "ebit_lucro_operacional__lair": saldo_4,
        "lair__ir_csll": min(saldo_4, gasto_ir),
        "prejuizo_liquido__ir_csll": gasto_ir - min(saldo_4, gasto_ir),
        "lair__lucro_liquido": saldo_5,
    }
    valores: dict[str, Decimal] = {}
    for link in links:
        conta = link["cod_conta"]
        if conta:
            valor = totais.por_conta.get(conta, ZERO)
        else:
            valor = cascata[link["cod_link"]]
        if valor > LIMIAR_LINK:
            valores[link["cod_link"]] = valor
    return valores


def nos_desequilibrados(valores: dict[str, Decimal], links: list[Linha]) -> list[str]:
    """Lista os nós intermediários em que a entrada difere da saída.

    Args:
        valores: Valor por cod_link, como devolvido por calcular_sankey.
        links: Linhas de dim_link_sankey.

    Returns:
        Os cod_no com diferença acima de R$ 0,05, em ordem alfabética.
    """
    entrada: defaultdict[str, Decimal] = defaultdict(Decimal)
    saida: defaultdict[str, Decimal] = defaultdict(Decimal)
    for link in links:
        valor = valores.get(link["cod_link"], ZERO)
        entrada[link["cod_no_destino"]] += valor
        saida[link["cod_no_origem"]] += valor
    intermediarios = {link["cod_no_origem"] for link in links} & {
        link["cod_no_destino"] for link in links
    }
    return sorted(
        no for no in intermediarios if abs(entrada[no] - saida[no]) > TOLERANCIA_NO
    )


def para_json(valor: object) -> float:
    """Serializa Decimal como número no JSON de saída.

    Raises:
        TypeError: Para qualquer tipo que não seja Decimal.
    """
    if isinstance(valor, Decimal):
        return float(valor)
    raise TypeError(f"tipo não serializável: {type(valor).__name__}")


def main() -> int:
    """Gera referencias.json e confere o fechamento do Sankey.

    Returns:
        0 se todos os recortes fecham; 1 caso contrário.
    """
    grupo_da_conta = {c["cod_conta"]: c["cod_grupo"] for c in ler_csv("dim_conta")}
    links = sorted(ler_csv("dim_link_sankey"), key=lambda link: int(link["ordem_link"]))
    regioes = [r["cod_regiao"] for r in ler_csv("dim_regiao")]
    calendario = ler_csv("dim_calendario")
    meses = [c["ano_mes"] for c in calendario]
    anos = sorted({c["ano"] for c in calendario})
    lancamentos = ler_csv("fato_lancamentos")

    def recorte(cenario: str, periodo: str, regiao: str | None = None) -> Totais:
        # periodo é o ano ("2025") ou o ano_mes ("2025-03"): prefixo da data AAAA-MM-DD
        return somar(
            (
                linha
                for linha in lancamentos
                if linha["cenario"] == cenario
                and linha["data"].startswith(periodo)
                and (regiao is None or linha["cod_regiao"] == regiao)
            ),
            grupo_da_conta,
        )

    dre_anual: dict[str, dict[str, dict[str, Decimal | None]]] = {}
    resultado_mensal: dict[str, dict[str, dict[str, Decimal]]] = {}
    meses_com_prejuizo: dict[str, list[str]] = {}
    for cenario in CENARIOS:
        dre_anual[cenario] = {}
        for ano in anos:
            dre = calcular_dre(recorte(cenario, ano))
            dre_anual[cenario][ano] = {
                **dre,
                "margem_bruta": calcular_margem(
                    dre["lucro_bruto"], dre["receita_liquida"]
                ),
                "margem_ebitda": calcular_margem(dre["ebitda"], dre["receita_liquida"]),
                "margem_liquida": calcular_margem(
                    dre["lucro_liquido"], dre["receita_liquida"]
                ),
            }
        resultado_mensal[cenario] = {}
        for mes in meses:
            dre = calcular_dre(recorte(cenario, mes))
            resultado_mensal[cenario][mes] = {
                chave: dre[chave]
                for chave in (
                    "receita_liquida",
                    "lucro_bruto",
                    "ebitda",
                    "lucro_liquido",
                )
            }
        meses_com_prejuizo[cenario] = [
            mes
            for mes in meses
            if resultado_mensal[cenario][mes]["lucro_liquido"] < ZERO
        ]

    lucro_por_regiao_abr_2025 = {
        regiao: calcular_dre(recorte("realizado", "2025-04", regiao))["lucro_liquido"]
        for regiao in regioes
    }
    sankey = {
        "2025-03": {"todas": calcular_sankey(recorte("realizado", "2025-03"), links)},
        "2025-04": {
            "todas": calcular_sankey(recorte("realizado", "2025-04"), links),
            "sudeste": calcular_sankey(
                recorte("realizado", "2025-04", "sudeste"), links
            ),
            "sul": calcular_sankey(recorte("realizado", "2025-04", "sul"), links),
        },
        "2025": {"todas": calcular_sankey(recorte("realizado", "2025"), links)},
    }

    # fechamento: mês, mês × região, ano e ano × região, nos dois cenários
    falhas: list[str] = []
    recortes_testados = 0
    for cenario in CENARIOS:
        for periodo in [*meses, *anos]:
            for regiao in [None, *regioes]:
                recortes_testados += 1
                valores = calcular_sankey(recorte(cenario, periodo, regiao), links)
                for no in nos_desequilibrados(valores, links):
                    falhas.append(f"{cenario} {periodo} {regiao or 'todas'} {no}")

    referencias = {
        "fonte": "dataset/*.csv (base fictícia, seed 42)",
        "contagens_csv": {tabela: len(ler_csv(tabela)) for tabela in TABELAS},
        "dre_anual": dre_anual,
        "resultado_mensal": resultado_mensal,
        "meses_com_prejuizo": meses_com_prejuizo,
        "lucro_liquido_por_regiao": {"2025-04": lucro_por_regiao_abr_2025},
        "sankey_realizado": sankey,
        "fechamento_sankey": {
            "recortes_testados": recortes_testados,
            "recortes_com_falha": len(falhas),
            "falhas": falhas,
        },
    }
    ARQUIVO_SAIDA.write_text(
        json.dumps(referencias, ensure_ascii=False, indent=2, default=para_json) + "\n",
        encoding="utf-8",
    )

    realizado = dre_anual["realizado"]
    print(f"{ARQUIVO_SAIDA.name} gerado")
    for ano in anos:
        print(
            f"  lucro líquido realizado {ano}: {realizado[ano]['lucro_liquido']}"
            f" (margem {realizado[ano]['margem_liquida']})"
        )
    print(f"  meses com prejuízo (realizado): {meses_com_prejuizo['realizado']}")
    print(f"  fechamento do Sankey: {recortes_testados} recortes, {len(falhas)} falhas")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
