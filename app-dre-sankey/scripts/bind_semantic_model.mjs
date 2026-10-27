// Liga o app ao dre-sankey do seu workspace: grava o fabric.yaml (fora do git) a partir
// da URL do modelo no portal do Fabric. Uso: npm run bind -- "<URL do dre-sankey>"

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec_file = promisify(execFile);
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(dirname(fileURLToPath(import.meta.resolve("@microsoft/fabric-app-data-cli"))), "cli.js");

const url = process.argv[2];
if (!url || !/\/groups\/[^/]+\/(semanticmodels|modeling|datasets)\/[^/?]+/i.test(url)) {
    console.error('Uso: npm run bind -- "<URL do dre-sankey no portal do Fabric>"');
    console.error("Abra o modelo semântico no portal e copie a URL da barra de endereço.");
    process.exit(1);
}

async function fabric_app_data(...argumentos) {
    const { stdout } = await exec_file(process.execPath, [cli, ...argumentos], { cwd: raiz, windowsHide: true });
    process.stdout.write(stdout);
}

if (!existsSync(resolve(raiz, "fabric.yaml"))) await fabric_app_data("init");
// o alias modelo_dre é o que o app usa (conexao_modelo em src/dados/consultas_dax.ts)
await fabric_app_data("add", "semanticModel", "modelo_dre", "--from-url", url);
await fabric_app_data("generate", "-o", "src/fabric.generated.ts");
