// Execução das consultas DAX no dre-sankey pelo cliente do template
// (FabricClient + EmbedFabricApiProxy, autenticação nativa do Fabric).

import { useEffect, useRef, useState } from "react";
import type { QueryTable } from "@microsoft/fabric-app-data";

import { getFabricClient } from "@/lib/fabric-client";
import { conexao_modelo } from "./consultas_dax";

export type Linha = Record<string, unknown>;

export interface ResultadoConsulta {
    tabela: QueryTable | undefined;
    linhas: Linha[] | undefined;
    carregando: boolean;
    erro: Error | undefined;
}

/** "dim_calendario[mes_ano]" → "mes_ano"; "[receita_liquida]" → "receita_liquida". */
export function nome_coluna(nome_bruto: string): string {
    const encontrado = /\[([^\]]+)\]$/.exec(nome_bruto);
    return encontrado ? encontrado[1] : nome_bruto;
}

export function linhas_da_tabela(tabela: QueryTable): Linha[] {
    const nomes = tabela.columns.map((coluna) => nome_coluna(coluna.name));
    return tabela.rows.map((linha) => Object.fromEntries(linha.map((valor, i) => [nomes[i], valor])));
}

export function numero(linha: Linha | undefined, campo: string): number | null {
    const valor = linha?.[campo];
    return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

export function texto(linha: Linha | undefined, campo: string): string {
    const valor = linha?.[campo];
    return valor === null || valor === undefined ? "" : String(valor);
}

interface RespostaConsulta {
    query: string;
    tabela?: QueryTable;
    linhas?: Linha[];
    erro?: Error;
}

/**
 * Executa a consulta quando `query` muda (`null` = não executar).
 * Enquanto a nova consulta não volta, mantém o resultado anterior na tela
 * (com `carregando`) e descarta respostas de consultas já substituídas, para que
 * uma troca rápida de filtro nunca mostre o resultado do filtro anterior.
 * O nome segue a regra de hooks do React (prefixo `use` em camelCase).
 */
export function useConsulta(query: string | null): ResultadoConsulta {
    const [resposta, definir_resposta] = useState<RespostaConsulta | undefined>();
    const ultima_query = useRef<string | null>(null);

    useEffect(() => {
        ultima_query.current = query;
        if (query === null) return;

        getFabricClient()
            .semanticModel(conexao_modelo)
            .query(query)
            .then((resultado) => {
                if (ultima_query.current !== query) return;
                definir_resposta(
                    resultado.status === "success"
                        ? { query, tabela: resultado.table, linhas: linhas_da_tabela(resultado.table) }
                        : { query, erro: new Error(resultado.error.message) },
                );
            })
            .catch((erro: unknown) => {
                if (ultima_query.current !== query) return;
                definir_resposta({ query, erro: erro instanceof Error ? erro : new Error(String(erro)) });
            });
    }, [query]);

    const atual = resposta?.query === query;
    return {
        tabela: resposta?.tabela,
        linhas: resposta?.linhas,
        carregando: query !== null && !atual,
        erro: atual ? resposta?.erro : undefined,
    };
}
