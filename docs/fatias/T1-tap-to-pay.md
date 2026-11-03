# T1 — Tap to Pay pronto para ativar

**Objetivo:** deixar o Tap pronto para o fornecedor entrar por configuração, e nunca marcar conta como paga sem cobrança real.
**Depende de:** G5, M2, O8; o critério 1 não depende de nada e pode sair antes · **Ativar depende de:** contrato com o fornecedor · **Spec:** `aditivo-comercial-e-pagamentos`, resposta 11 · **ADRs:** 029, 031 · **Invariantes:** 2, 6, 10

## Critérios de aceite
1. Sem fornecedor ativo no parâmetro, a tela de Tap fica oculta para todos os perfis, e `WaiterTapToPayScreen` não registra pagamento sem cobrança real.
2. O fornecedor ativo fica em parâmetro e as credenciais em segredo; trocar ou ligar o fornecedor não exige nova versão do app.
3. A camada de integração recebe o SDK ou a API do fornecedor sem mudar o fluxo.
4. Fluxo completo: cobrar, aprovar ou recusar, abater o saldo, registrar no caixa e no extrato. Recusado não abate nada.
5. Até a ativação, o garçom registra como "Maquininha da casa", sem taxa NOOWE Pay e fora do índice dos créditos.
6. Ao ligar o fornecedor, o Tap aparece para o garçom e `tap_to_pay` volta à lista do plano Profissional, sem nova versão.
7. Cobrança idempotente: reenviar não cobra duas vezes.
