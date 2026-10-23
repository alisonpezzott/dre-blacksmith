//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from "react-error-boundary";
import { useCssTheme } from "@microsoft/fabric-visuals";

import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import App from './App.tsx';
import { ErrorFallback } from './ErrorFallback';
import { ThemeContext } from './hooks/theme.context';
import { AuthProvider } from './hooks/use-auth';
import { bootstrapAuth } from './services/rayfin-auth.service';
import { AuthGate } from './components/auth-gate.component';
import { useTema } from './estado/estado_tema';

import "./global.css"

const rayfinAuthService = bootstrapAuth();

function Root() {
    // temas Carbon (seção 9 do CLAUDE.md): escuro por padrão, claro pelo botão do cabeçalho
    const { tema, alternar_tema } = useTema();
    const theme = useCssTheme();

    return (
        <ThemeContext.Provider value={{ isDark: tema === "escuro", toggleTheme: alternar_tema, theme }}>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <AuthProvider rayfinAuthService={rayfinAuthService}>
                    <AuthGate>
                        <App />
                    </AuthGate>
                </AuthProvider>
            </ErrorBoundary>
        </ThemeContext.Provider>
    );
}

createRoot(document.getElementById('root')!).render(<Root />)
