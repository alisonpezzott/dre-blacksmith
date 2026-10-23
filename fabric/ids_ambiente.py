"""Troca os IDs do ambiente Fabric por marcadores e vice-versa.

Os itens em fabric/ são versionados com marcadores ({{ID_WORKSPACE}}, {{ID_LAKEHOUSE}}…)
no lugar dos IDs do workspace, do lakehouse e dos notebooks. Os valores ficam no .env
da raiz (fora do git).

    uv run fabric/ids_ambiente.py implantar    # cópia com os IDs em .implantacao/fabric/
    uv run fabric/ids_ambiente.py implantar nb_01_ingestao.Notebook   # só confere esse item
    uv run fabric/ids_ambiente.py anonimizar   # IDs do .env -> marcadores, em fabric/

Use `implantar` antes do `fab import` (importar a partir de .implantacao/fabric/) e
`anonimizar` depois de um `fab export` para dentro de fabric/, antes do commit. Com
itens na linha de comando, só esses precisam ter todos os IDs no .env: na primeira
implantação os notebooks ainda não têm ID, e o pipeline vem depois deles.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

PASTA_RAIZ = Path(__file__).resolve().parent.parent
PASTA_FABRIC = PASTA_RAIZ / "fabric"
PASTA_IMPLANTACAO = PASTA_RAIZ / ".implantacao" / "fabric"
ARQUIVO_ENV = PASTA_RAIZ / ".env"

# chaves do .env que viram marcadores nos itens do Fabric
CHAVES = (
    "ID_WORKSPACE",
    "ID_LAKEHOUSE",
    "ID_NB_01_INGESTAO",
    "ID_NB_02_QUALIDADE",
    "ID_NB_03_ATUALIZAR_MODELO",
)
EXTENSOES = {".py", ".json", ".tmdl", ".pbism", ".platform"}
MARCADOR = re.compile(r"\{\{(ID_[A-Z0-9_]+)\}\}")


def ler_env() -> dict[str, str]:
    """Lê as chaves CHAVE=valor do .env da raiz, ignorando comentários."""
    valores: dict[str, str] = {}
    for linha in ARQUIVO_ENV.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            chave, valor = linha.split("=", 1)
            # "<...>" é o texto de exemplo do .env.example, não um ID
            if not valor.strip().startswith("<"):
                valores[chave.strip()] = valor.strip()
    return valores


def arquivos_itens(pasta: Path) -> list[Path]:
    """Arquivos de definição dos itens (pastas *.Notebook, *.SemanticModel…)."""
    return [
        arquivo
        for arquivo in pasta.rglob("*")
        if arquivo.is_file()
        and (arquivo.suffix in EXTENSOES or arquivo.name == ".platform")
        and any("." in parte for parte in arquivo.relative_to(pasta).parts[:-1])
    ]


def anonimizar(ids: dict[str, str]) -> int:
    """Substitui, em fabric/, cada ID do .env pelo marcador correspondente."""
    alterados = 0
    for arquivo in arquivos_itens(PASTA_FABRIC):
        texto = arquivo.read_text(encoding="utf-8")
        novo = texto
        for chave in CHAVES:
            if ids.get(chave):
                novo = re.sub(
                    re.escape(ids[chave]),
                    "{{" + chave + "}}",
                    novo,
                    flags=re.IGNORECASE,
                )
        if novo != texto:
            arquivo.write_text(novo, encoding="utf-8", newline="")
            alterados += 1
            print(f"anonimizado: {arquivo.relative_to(PASTA_RAIZ)}")
    return alterados


def implantar(ids: dict[str, str], itens: list[str]) -> None:
    """Copia fabric/ para .implantacao/fabric/ com os marcadores trocados pelos IDs.

    `itens` vazio = todos; senão, só esses itens precisam ter todos os IDs no .env
    (os demais ficam com os marcadores que ainda não têm valor).
    """
    desconhecidos = [item for item in itens if not (PASTA_FABRIC / item).is_dir()]
    if desconhecidos:
        sys.exit(f"itens inexistentes em fabric/: {', '.join(desconhecidos)}")
    pastas = [PASTA_FABRIC / item for item in itens] or [PASTA_FABRIC]
    faltando = sorted(
        {
            chave
            for pasta in pastas
            for arquivo in arquivos_itens(PASTA_FABRIC)
            if arquivo.is_relative_to(pasta)
            for chave in MARCADOR.findall(arquivo.read_text(encoding="utf-8"))
            if not ids.get(chave)
        }
    )
    if faltando:
        sys.exit(f"chaves sem valor no .env: {', '.join(faltando)}")

    if PASTA_IMPLANTACAO.exists():
        shutil.rmtree(PASTA_IMPLANTACAO)
    shutil.copytree(
        PASTA_FABRIC,
        PASTA_IMPLANTACAO,
        ignore=shutil.ignore_patterns("ids_ambiente.py"),
    )
    for arquivo in arquivos_itens(PASTA_IMPLANTACAO):
        texto = arquivo.read_text(encoding="utf-8")
        novo = MARCADOR.sub(lambda m: ids.get(m.group(1)) or m.group(0), texto)
        if novo != texto:
            arquivo.write_text(novo, encoding="utf-8", newline="")
    print(
        f"itens prontos para o fab import em {PASTA_IMPLANTACAO.relative_to(PASTA_RAIZ)}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("comando", choices=["implantar", "anonimizar"])
    parser.add_argument(
        "itens", nargs="*", help="pastas de itens (ex.: nb_01_ingestao.Notebook)"
    )
    args = parser.parse_args()
    ids = ler_env()
    if args.comando == "implantar":
        implantar(ids, args.itens)
    else:
        print(f"{anonimizar(ids)} arquivo(s) alterado(s)")


if __name__ == "__main__":
    main()
