// DRE em tabela: contas em ordem_dre, realizado × orçado × variação, com os subtotais
// do modelo (lucro bruto, EBITDA, EBIT, LAIR, lucro líquido) intercalados e destacados.

import { useMemo } from "react";
import { DataGrid, type GridColumnDef, type Row } from "@microsoft/fabric-datagrid";

import type { Linha } from "@/dados/cliente_modelo";
import { montar_linhas_dre } from "@/dados/linhas_dre";
import { formatar, formatos } from "@/dados/formatacao";
import { useThemeContext } from "@/hooks/theme.context";
import { cn } from "@/lib/utils";
import { Cartao, EstadoErro, EstadoCarregando, EstadoVazio } from "./estados_carregamento";

interface TabelaDreProps {
    contas: Linha[] | undefined;
    subtotais: Linha[] | undefined;
    carregando: boolean;
    erro: Error | undefined;
    subtitulo: string;
    className?: string;
}

function valor_celula(formato: typeof formatos.moeda | typeof formatos.variacao_pct, colorir: boolean) {
    return (valor: unknown, row: Row) => {
        const tipo = row["tipo_linha"];
        const n = typeof valor === "number" ? valor : null;
        return (
            <span
                className={cn(
                    "numero block w-full text-right",
                    tipo === "destaque" && "font-semibold text-foreground",
                    tipo === "subtotal" && "font-medium text-foreground",
                    tipo === "conta" && "text-muted-foreground",
                    colorir && n !== null && n > 0 && "text-turquesa",
                    colorir && n !== null && n < 0 && "text-laranja",
                    !colorir && tipo === "destaque" && n !== null && n < 0 && "text-rosa-neon",
                )}
            >
                {formatar(n, formato)}
            </span>
        );
    };
}

const colunas: GridColumnDef[] = [
    { id: "tipo_linha", header: "Tipo", hidden: true },
    {
        id: "nome",
        header: "Linha da DRE",
        minWidth: 220,
        cellRenderer: (valor, row) => {
            const tipo = row["tipo_linha"];
            return (
                <span
                    className={cn(
                        "block truncate",
                        tipo === "conta" && "pl-4 text-muted-foreground",
                        tipo === "subtotal" && "font-medium text-foreground",
                        tipo === "destaque" && "font-heading font-semibold text-ciano",
                    )}
                >
                    {String(valor ?? "")}
                </span>
            );
        },
    },
    { id: "realizado", header: "Realizado", minWidth: 130, cellRenderer: valor_celula(formatos.moeda, false) },
    { id: "orcado", header: "Orçado", minWidth: 130, cellRenderer: valor_celula(formatos.moeda, false) },
    { id: "var_pct", header: "Var. %", minWidth: 90, cellRenderer: valor_celula(formatos.variacao_pct, true) },
];

export function TabelaDre({ contas, subtotais, carregando, erro, subtitulo, className }: TabelaDreProps) {
    const { theme } = useThemeContext();
    const dados = useMemo(
        () => (contas && subtotais ? montar_linhas_dre(contas, subtotais) : null),
        [contas, subtotais],
    );

    let conteudo;
    if (erro) conteudo = <EstadoErro erro={erro} />;
    else if (carregando && !dados) conteudo = <EstadoCarregando />;
    else if (!dados || dados.rows.length === 0) conteudo = <EstadoVazio />;
    else {
        conteudo = (
            <DataGrid
                data={dados}
                columns={colunas}
                theme={theme}
                chromeless
                rowHeight={32}
                capabilities={{ disableSorting: true, disableFiltering: true, disableColumnReorder: true }}
            />
        );
    }

    return (
        <Cartao titulo="DRE · realizado × orçado" subtitulo={subtitulo} className={className}>
            <div className="min-h-0 flex-1">{conteudo}</div>
            <p className="mt-2 text-200 text-texto-fraco">
                Variação: (realizado − orçado) ÷ |orçado|. Negativa = pior que o orçado, para receitas e para gastos.
            </p>
        </Cartao>
    );
}
