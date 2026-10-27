# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {}
# META }

# MARKDOWN ********************

# # nb_03_atualizar_modelo
# Liga o `sm_blacksmith_dre` ao `lh_blacksmith` do próprio workspace e reenquadra (refresh) o modelo com semantic link. É o último passo do `pl_blacksmith_carga` e só roda depois que o `nb_02_qualidade` passou.
# - O modelo vem do Git apontando para o OneLake do workspace de origem. Num workspace sincronizado a partir do repositório, a primeira execução troca esse endereço pelo do lakehouse local; nas seguintes não há nada a trocar.
# - Com "Keep your Direct Lake data up to date" desligado no modelo, os dados novos só chegam ao app depois dos testes de qualidade.
# - Usa notebook em vez da atividade de refresh do pipeline porque essa atividade exige uma conexão OAuth2, que só pode ser criada no portal.

# PARAMETERS CELL ********************

modelo_semantico = "sm_blacksmith_dre"
lakehouse = "lh_blacksmith"
intervalo_consulta_s = 10
tempo_maximo_s = 900

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

import base64
import re
import time
from typing import Any

import sempy.fabric as fabric
from requests import Response

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

cliente = fabric.FabricRestClient()


def aguardar_operacao(resposta: Response, com_resultado: bool) -> Any:
    """Acompanha uma operação longa da API do Fabric (202 + Location) e devolve o resultado."""
    if resposta.status_code == 200:
        return resposta.json() if com_resultado else None
    assert resposta.status_code == 202, f"{resposta.status_code}: {resposta.text}"
    url_operacao = resposta.headers["Location"]
    inicio = time.monotonic()
    while True:
        time.sleep(int(resposta.headers.get("Retry-After", intervalo_consulta_s)))
        resposta = cliente.get(url_operacao)
        estado = resposta.json()
        if estado["status"] in ("Succeeded", "Failed"):
            break
        assert time.monotonic() - inicio < tempo_maximo_s, f"operação sem conclusão após {tempo_maximo_s} s"
    assert estado["status"] == "Succeeded", f"operação falhou: {estado}"
    return cliente.get(f"{url_operacao}/result").json() if com_resultado else None

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# endereço do lakehouse deste workspace, no formato da expressão Direct Lake on OneLake
id_workspace = fabric.get_workspace_id()
id_modelo = fabric.resolve_item_id(modelo_semantico, type="SemanticModel")
id_lakehouse = fabric.resolve_item_id(lakehouse, type="Lakehouse")
url_lakehouse = f"https://onelake.dfs.fabric.microsoft.com/{id_workspace}/{id_lakehouse}"

url_modelo = f"v1/workspaces/{id_workspace}/semanticModels/{id_modelo}"
definicao = aguardar_operacao(cliente.post(f"{url_modelo}/getDefinition?format=TMDL"), com_resultado=True)
partes = [p for p in definicao["definition"]["parts"] if p["path"] != ".platform"]
expressoes = next(p for p in partes if p["path"] == "definition/expressions.tmdl")

tmdl = base64.b64decode(expressoes["payload"]).decode("utf-8")
tmdl_local = re.sub(r"https://onelake\.dfs\.fabric\.microsoft\.com/[^/\"]+/[^/\"]+", url_lakehouse, tmdl)

if tmdl_local == tmdl:
    print(f"{modelo_semantico} já aponta para o {lakehouse} deste workspace")
else:
    expressoes["payload"] = base64.b64encode(tmdl_local.encode("utf-8")).decode("ascii")
    corpo = {"definition": {"format": "TMDL", "parts": partes}}
    aguardar_operacao(cliente.post(f"{url_modelo}/updateDefinition", json=corpo), com_resultado=False)
    print(f"{modelo_semantico} religado ao {lakehouse} deste workspace")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# sem workspace explícito: o semantic link usa o workspace do próprio notebook
id_refresh = fabric.refresh_dataset(dataset=modelo_semantico, refresh_type="full")
print(f"refresh solicitado: {id_refresh}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# acompanha o refresh até terminar; falha o notebook (e o pipeline) se não concluir
inicio = time.monotonic()
while True:
    detalhes = fabric.get_refresh_execution_details(modelo_semantico, id_refresh)
    if detalhes.status not in ("Unknown", "NotStarted", "InProgress"):
        break
    assert time.monotonic() - inicio < tempo_maximo_s, f"refresh sem conclusão após {tempo_maximo_s} s"
    time.sleep(intervalo_consulta_s)

print(f"status do refresh: {detalhes.status}")
assert detalhes.status == "Completed", f"refresh terminou com status {detalhes.status}: {detalhes.messages}"
print("modelo atualizado")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
