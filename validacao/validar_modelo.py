"""Valida o sm_blacksmith_dre contra validacao/referencias.json.

Roda as consultas de validacao/dax/ pela API executeQueries do Power BI (via `fab api`,
com o login do fab CLI) e compara cada resultado com o gabarito gerado por
gerar_referencias.py. Lê os IDs do workspace e do modelo do fabric.yaml do app
(gravado por `npm run conectar` em app_blacksmith_dre/).

    uv run validacao/validar_modelo.py

Termina com código 1 se alguma verificação falhar.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeAlias

PASTA_VALIDACAO = Path(__file__).resolve().parent
PASTA_DAX = PASTA_VALIDACAO / "dax"
ARQUIVO_CONEXAO = PASTA_VALIDACAO.parent / "app_blacksmith_dre" / "fabric.yaml"
TOLERANCIA_VALOR = 1.0  # R$ 1,00, como na seção 1 do CLAUDE.md
TOLERANCIA_RAZAO = 1e-4  # margens e variações em fração

Linha: TypeAlias = dict[str, Any]
CAMPOS_DRE = (
    "receita_bruta",
    "deducoes_receita",
    "receita_liquida",
    "custos",
    "lucro_bruto",
    "despesas_operacionais",
    "ebitda",
    "depreciacao_amortizacao",
    "ebit",
    "resultado_financeiro",
    "lair",
    "ir_csll",
    "lucro_liquido",
)


def ler_conexao() -> dict[str, str]:
    """Lê workspaceId e itemId da conexão modelo_dre no fabric.yaml do app.

    Raises:
        FileNotFoundError: Se o app ainda não foi conectado ao modelo.
        KeyError: Se a conexão modelo_dre não estiver completa.
    """
    if not ARQUIVO_CONEXAO.exists():
        raise FileNotFoundError(
            f"{ARQUIVO_CONEXAO} não existe; rode `npm run conectar` em app_blacksmith_dre/"
        )
    texto = ARQUIVO_CONEXAO.read_text(encoding="utf-8")
    bloco = texto[texto.index("modelo_dre:") :]
    valores = dict(
        re.findall(r"^\s*(workspaceId|itemId):\s*['\"]?([\w-]+)", bloco, re.MULTILINE)
    )
    return {"workspaceId": valores["workspaceId"], "itemId": valores["itemId"]}


def localizar_fab() -> str:
    """Devolve o executável do fab CLI (PATH ou instalação padrão do uv tool).

    Raises:
        FileNotFoundError: Se o fab não estiver instalado.
    """
    encontrado = shutil.which("fab")
    if encontrado:
        return encontrado
    padrao = Path.home() / ".local" / "bin" / ("fab.exe" if os.name == "nt" else "fab")
    if padrao.exists():
        return str(padrao)
    raise FileNotFoundError("fab CLI não encontrado; instale com uv tool install")


def consultas_do_arquivo(nome: str) -> list[str]:
    """Separa um arquivo .dax em consultas com um EVALUATE cada.

    O trecho antes do primeiro EVALUATE (o DEFINE, se houver) é repetido em todas.

    Args:
        nome: Nome do arquivo em validacao/dax/.

    Returns:
        As consultas na ordem do arquivo.
    """
    texto = (PASTA_DAX / nome).read_text(encoding="utf-8")
    partes = re.split(r"^EVALUATE\b", texto, flags=re.MULTILINE)
    preambulo = partes[0] if "DEFINE" in partes[0] else ""
    return [f"{preambulo}\nEVALUATE{parte}" for parte in partes[1:]]


def executar(fab: str, ids: dict[str, str], consulta: str) -> list[Linha]:
    """Executa uma consulta DAX no modelo e devolve as linhas com nomes curtos.

    Args:
        fab: Executável do fab CLI.
        ids: workspaceId e itemId do modelo, lidos do fabric.yaml do app.
        consulta: Consulta DAX com um EVALUATE.

    Returns:
        Linhas com as colunas sem prefixo de tabela (ex.: ``ano``, ``lucro_liquido``).

    Raises:
        RuntimeError: Se a API devolver erro.
    """
    corpo = {
        "queries": [{"query": consulta}],
        "serializerSettings": {"includeNulls": True},
    }
    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8"
    ) as arquivo:
        json.dump(corpo, arquivo)
    try:
        rota = f"groups/{ids['workspaceId']}/datasets/{ids['itemId']}/executeQueries"
        saida = subprocess.run(
            [fab, "api", "-A", "powerbi", "-X", "post", rota, "-i", arquivo.name],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        ).stdout
    finally:
        os.unlink(arquivo.name)
    resposta = json.loads(saida[saida.index("{") :])
    if resposta.get("status_code") != 200:
        raise RuntimeError(f"executeQueries falhou: {json.dumps(resposta)[:2000]}")
    tabela = resposta["text"]["results"][0]["tables"][0]
    if "error" in resposta["text"]["results"][0]:
        raise RuntimeError(json.dumps(resposta["text"]["results"][0]["error"]))
    return [
        {re.sub(r"^.*\[(.*)\]$", r"\1", chave): valor for chave, valor in linha.items()}
        for linha in tabela.get("rows", [])
    ]


class Verificador:
    """Acumula o resultado de cada verificação e imprime um resumo."""

    def __init__(self) -> None:
        """Começa sem verificações."""
        self.resultados: list[tuple[str, bool, str]] = []

    def checar(self, nome: str, ok: bool, detalhe: str = "") -> None:
        """Registra uma verificação."""
        self.resultados.append((nome, ok, detalhe))
        print(f"[{'ok' if ok else 'FALHA'}] {nome}{f' — {detalhe}' if detalhe else ''}")

    @property
    def falhas(self) -> int:
        """Quantidade de verificações que falharam."""
        return sum(1 for _, ok, _ in self.resultados if not ok)


def perto(obtido: Any, esperado: Any, tolerancia: float = TOLERANCIA_VALOR) -> bool:
    """Compara números com tolerância; vazio só casa com vazio."""
    if obtido is None or esperado is None:
        return obtido is None and esperado is None
    return abs(float(obtido) - float(esperado)) <= tolerancia


def comparar_links(obtidos: list[Linha], esperados: dict[str, float]) -> str:
    """Descreve as diferenças entre os links do modelo e os do gabarito ('' se iguais)."""
    valores = {linha["cod_link"]: linha["valor"] for linha in obtidos}
    diferencas = [
        f"{link}: obtido {valores.get(link)}, esperado {esperados.get(link)}"
        for link in sorted(set(valores) | set(esperados))
        if not perto(valores.get(link), esperados.get(link))
    ]
    return "; ".join(diferencas)


def main() -> int:
    """Roda v01 a v06 e compara com o gabarito.

    Returns:
        0 se tudo bate; 1 caso contrário.
    """
    ref = json.loads((PASTA_VALIDACAO / "referencias.json").read_text(encoding="utf-8"))
    ids = ler_conexao()
    fab = localizar_fab()
    v = Verificador()

    def rodar(arquivo: str) -> list[list[Linha]]:
        return [
            executar(fab, ids, consulta) for consulta in consultas_do_arquivo(arquivo)
        ]

    # v01: DRE anual por cenário
    (dre,) = rodar("v01_dre_anual.dax")
    for linha in dre:
        esperado = ref["dre_anual"][linha["cod_cenario"]][str(linha["ano"])]
        erradas = [c for c in CAMPOS_DRE if not perto(linha[c], esperado[c])]
        erradas += [
            c
            for c in ("margem_bruta", "margem_ebitda", "margem_liquida")
            if not perto(linha[c], esperado[c], TOLERANCIA_RAZAO)
        ]
        v.checar(
            f"v01 DRE {linha['cod_cenario']} {linha['ano']}",
            not erradas,
            f"divergem: {erradas}" if erradas else "",
        )
    v.checar("v01 recortes", len(dre) == 6, f"{len(dre)} linhas")

    # v02: resultado mensal e meses com prejuízo
    mensal, prejuizo = rodar("v02_resultado_mensal.dax")
    erradas_mes = [
        f"{linha['cod_cenario']} {linha['ano_mes']}"
        for linha in mensal
        if not all(
            perto(
                linha[c],
                ref["resultado_mensal"][linha["cod_cenario"]][linha["ano_mes"]][c],
            )
            for c in ("receita_liquida", "lucro_bruto", "ebitda", "lucro_liquido")
        )
    ]
    v.checar(
        "v02a resultado mensal (72 recortes)",
        len(mensal) == 72 and not erradas_mes,
        f"{len(mensal)} linhas; divergem: {erradas_mes}"
        if erradas_mes or len(mensal) != 72
        else "",
    )
    # o "+ 0" da consulta traz o membro em branco das dimensões (Direct Lake); fica de fora
    contagem = {
        (linha["cod_cenario"], linha["ano"]): linha["meses_com_prejuizo"]
        for linha in prejuizo
        if linha["cod_cenario"] is not None and linha["ano"] is not None
    }
    esperado_prejuizo = {
        (c, a): (2 if (c, a) == ("realizado", 2025) else 0)
        for c in ("realizado", "orcado")
        for a in (2024, 2025, 2026)
    }
    v.checar("v02b meses_com_prejuizo", contagem == esperado_prejuizo, str(contagem))

    # v03: links do sankey
    marco, abril, ano_2025, regioes = rodar("v03_sankey_cenarios.dax")
    sankey = ref["sankey_realizado"]
    for nome, obtido, esperado in (
        ("v03a sankey mar/2025", marco, sankey["2025-03"]["todas"]),
        ("v03b sankey abr/2025", abril, sankey["2025-04"]["todas"]),
        ("v03c sankey 2025", ano_2025, sankey["2025"]["todas"]),
    ):
        diferencas = comparar_links(obtido, esperado)
        v.checar(nome, not diferencas, diferencas)
    for regiao in ("sudeste", "sul"):
        diferencas = comparar_links(
            [linha for linha in regioes if linha["cod_regiao"] == regiao],
            sankey["2025-04"][regiao],
        )
        v.checar(f"v03d sankey abr/2025 {regiao}", not diferencas, diferencas)

    # v04: fechamento dos nós em todos os recortes
    for nome, linhas in zip(
        ("v04a", "v04b", "v04c", "v04d"), rodar("v04_fechamento_nos.dax")
    ):
        v.checar(
            f"{nome} fechamento dos nós",
            not linhas,
            f"{len(linhas)} nós desequilibrados: {linhas[:5]}" if linhas else "",
        )

    # v05: comparativos, guarda das _aa e erros
    anual, todos, erros = rodar("v05_comparativos.dax")
    por_ano = {linha["ano"]: linha for linha in anual}
    dre_real = ref["dre_anual"]["realizado"]
    v.checar(
        "v05a receita_liquida_aa 2025 = receita_liquida 2024",
        perto(por_ano[2025]["receita_liquida_aa"], dre_real["2024"]["receita_liquida"]),
    )
    v.checar(
        "v05a _aa vazias em 2024",
        all(
            por_ano[2024][c] is None
            for c in (
                "receita_liquida_aa",
                "lucro_liquido_aa",
                "lucro_bruto_aa",
                "ebitda_aa",
            )
        ),
    )
    checagens_aa: list[tuple[str, Callable[[], bool]]] = [
        (
            "lucro_bruto_aa 2026",
            lambda: perto(
                por_ano[2026]["lucro_bruto_aa"], dre_real["2025"]["lucro_bruto"]
            ),
        ),
        (
            "ebitda_aa 2026",
            lambda: perto(por_ano[2026]["ebitda_aa"], dre_real["2025"]["ebitda"]),
        ),
        (
            "lucro_liquido_aa 2025",
            lambda: perto(
                por_ano[2025]["lucro_liquido_aa"], dre_real["2024"]["lucro_liquido"]
            ),
        ),
        (
            "margem_liquida_aa 2026",
            lambda: perto(
                por_ano[2026]["margem_liquida_aa"],
                dre_real["2025"]["margem_liquida"],
                TOLERANCIA_RAZAO,
            ),
        ),
        (
            "var_margem_liquida_aa_pp 2026",
            lambda: perto(
                por_ano[2026]["var_margem_liquida_aa_pp"],
                (
                    dre_real["2026"]["margem_liquida"]
                    - dre_real["2025"]["margem_liquida"]
                )
                * 100,
                0.01,
            ),
        ),
        (
            "receita_liquida_acumulada_ano 2025",
            lambda: perto(
                por_ano[2025]["receita_liquida_acumulada_ano"],
                dre_real["2025"]["receita_liquida"],
            ),
        ),
        (
            "var_lucro_liquido_orcado_pct 2025",
            lambda: perto(
                por_ano[2025]["var_lucro_liquido_orcado_pct"],
                (
                    dre_real["2025"]["lucro_liquido"]
                    - ref["dre_anual"]["orcado"]["2025"]["lucro_liquido"]
                )
                / abs(ref["dre_anual"]["orcado"]["2025"]["lucro_liquido"]),
                TOLERANCIA_RAZAO,
            ),
        ),
    ]
    for nome, teste in checagens_aa:
        v.checar(f"v05a {nome}", teste())
    v.checar(
        "v05b _aa vazias em todos os anos",
        all(valor is None for valor in todos[0].values()),
        str(todos[0]),
    )
    v.checar(
        "v05c medidas sem erro por mes_ano",
        erros[0]["qtd_meses"] == 36 and erros[0]["qtd_erros"] == 0,
        str(erros[0]),
    )

    # v06: regiões em abr/2025
    lucro_regiao, links_prejuizo = rodar("v06_regioes_abr2025.dax")
    # prejuizo_liquido devolve 0 (não vazio), então o membro em branco de dim_regiao aparece
    lucro_regiao = [linha for linha in lucro_regiao if linha["cod_regiao"] is not None]
    esperado_regiao = ref["lucro_liquido_por_regiao"]["2025-04"]
    v.checar(
        "v06a lucro líquido por região abr/2025",
        len(lucro_regiao) == 5
        and all(
            perto(linha["lucro_liquido"], esperado_regiao[linha["cod_regiao"]])
            for linha in lucro_regiao
        ),
    )
    regioes_com_prejuizo = sorted({linha["cod_regiao"] for linha in links_prejuizo})
    v.checar(
        "v06b links de prejuízo só no Sudeste",
        regioes_com_prejuizo == ["sudeste"],
        str(regioes_com_prejuizo),
    )

    print(f"\n{len(v.resultados)} verificações, {v.falhas} falhas")
    return 1 if v.falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
