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
# # Reenquadra (refresh) o `sm_blacksmith_dre` com semantic link. É o último passo do `pl_blacksmith_carga` e só roda depois que o `nb_02_qualidade` passou: com "Keep your Direct Lake data up to date" desligado no modelo, os dados novos só chegam ao app depois dos testes de qualidade.
# # Usa notebook em vez da atividade de refresh do pipeline porque essa atividade exige uma conexão OAuth2, que só pode ser criada no portal.

# PARAMETERS CELL ********************

modelo_semantico = "sm_blacksmith_dre"
intervalo_consulta_s = 10
tempo_maximo_s = 900

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

import time

import sempy.fabric as fabric

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
