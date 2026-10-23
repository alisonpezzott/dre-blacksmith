// Tema do app: escuro (Carbon g100) por padrão, claro (Carbon g10) por escolha do usuário.
// A escolha fica no navegador; sem ela, o app abre no escuro.

import { useCallback, useEffect, useState } from "react";

import type { Tema } from "@/tema/tema_graficos";

const chave_armazenamento = "blacksmith_tema";

function tema_salvo(): Tema {
    try {
        return localStorage.getItem(chave_armazenamento) === "claro" ? "claro" : "escuro";
    } catch {
        return "escuro";
    }
}

/** Aplica o tema no <html>: classe .dark (Tailwind e tokens), data-appearance e color-scheme. */
function aplicar_tema(tema: Tema): void {
    const raiz = document.documentElement;
    raiz.classList.toggle("dark", tema === "escuro");
    raiz.setAttribute("data-appearance", tema === "escuro" ? "dark" : "light");
    raiz.style.colorScheme = tema === "escuro" ? "dark" : "light";
}

export function useTema(): { tema: Tema; alternar_tema: () => void } {
    const [tema, definir_tema] = useState<Tema>(() => {
        const inicial = tema_salvo();
        aplicar_tema(inicial);
        return inicial;
    });

    useEffect(() => {
        aplicar_tema(tema);
        try {
            localStorage.setItem(chave_armazenamento, tema);
        } catch {
            // armazenamento bloqueado: o tema vale só para esta sessão
        }
    }, [tema]);

    const alternar_tema = useCallback(() => definir_tema((atual) => (atual === "escuro" ? "claro" : "escuro")), []);
    return { tema, alternar_tema };
}
