# Pendências para o Pedro

**Respondidas em 05/11/2026.** O texto íntegro está no [aditivo](../spec/aditivo-comercial-e-pagamentos.md), seção
"Respostas às pendências 33–92", e o resumo por item em [PENDENCIAS-perfis-workflows](PENDENCIAS-perfis-workflows.md).

## Ainda com a NOOWE

Nenhum destes trava o build: tudo entra pela tabela de parâmetros ou fora do app.

| # | O quê | Onde entra |
|---|---|---|
| 91 | Código de serviço e alíquotas de cada tipo de nota: assinatura, taxa NOOWE Pay semanal e taxa de conveniência | `private.noowe_nfse_types` (ver `docs/PARAMETROS-NOOWE.md`) |
| 91 | Configuração fiscal da conta NOOWE no Asaas: série do RPS e acesso à prefeitura | Painel do Asaas |
| 38 | Ligar a taxa de conveniência (R$ 0,99) depois que a nota tipo 3 estiver configurada | `private.noowe_convenience_fees` |
| — | Universal links: acesso ao repositório do site e à hospedagem, para publicar o arquivo da Apple | Site noowebr.com |
