# Decisões do QA de 25/11 — tomadas em 26/11/2026

Respostas às perguntas de `docs/PERGUNTAS-PEDRO-QA-2026-11-26.md`, tomadas pelo time de desenvolvimento a pedido do responsável pelo projeto, no lugar do Pedro. **Status: PROVISÓRIO** — valem como default até o Pedro revisar. Toda regra numérica vai para `establishment_config` (ou parâmetro NOOWE), isolada numa função nomeada, para que trocar seja mudança de uma linha.

Critério usado: na dúvida, a opção mais segura para o cliente final e para a LGPD, que não cria custo escondido para ninguém e que é reversível.

| # | Tema | Decisão |
|---|---|---|
| 1 | PAG-07 Pix de valor baixo | **(b)** O restaurante paga a tarifa real do Asaas. O extrato do Dono mostra o líquido real (valor − tarifa − split). Sem valor mínimo de Pix. |
| 2 | RV-05 Quick abaixo do mínimo online | **Sim.** Cria o pedido em `awaiting_payment` como "Pague no balcão". Só entra em produção quando o caixa confirma o pagamento (invariante 6). |
| 3 | RV-01 / RV-18 provedor e ambiente | Pix segue **só no Asaas**; o provedor vira parâmetro, mas só o Asaas é implementado. A trava de ambiente **bloqueia a cobrança** (restaurante real com chave sandbox, ou o contrário, não cobra e avisa o Dono). |
| 4 | RV-04, RV-06, RV-08 | RV-04: **sim**, tarefa para a equipe devolver Pix sem saldo. RV-06: **sim**, excedente entra na fatura do mês. RV-08: cupom FUNDADOR com **validade de 90 dias e limite de 100 restaurantes** (parâmetros, revisáveis). |
| 5 | CPFs salvos sem consentimento | **(a) Apagar.** Minimização da LGPD. A nota da conveniência dessas pessoas usa o CPF informado no próximo pagamento. |
| 6 | SG-04 cupom oculto | **Não** pode ser listado por outra conta. Escrever o teste do cupom oculto e corrigir se falhar. |
| 7 | Projeto de produção | **(a)** Criar um projeto Supabase separado de produção. O `eplivpvqemowmbivhfpx` fica como desenvolvimento/QA, com os atalhos de teste ligados. `scripts/check-dev-flags.sh` roda contra o novo projeto antes do go-live. |
| 8 | Apple Pay / Google Pay | **(a)** Perguntar ao suporte do Asaas. PAG-03 fica adiado até a resposta; não troca de provedor agora. |
| 9 | Cartão salvo por restaurante | **Aceitar** por restaurante nesta versão. Centralizar na conta da NOOWE fica para depois da release. |
| 10 | Liberação de tokenização | **A NOOWE pede** ao Asaas, para R1–R3 agora e para cada restaurante novo no onboarding (entra no `ACOES_HUMANAS_PUBLICACAO.md`). |
| 11 | Cortesia pelo app | **Garçom ou Gerente pede**, por item da conta, com motivo. **Gerente ou Dono aprova**; ninguém aprova o próprio pedido (regra já existente). |
| 12 | LGPD | **Sim, antes da release:** registro do aceite dos Termos com versão e data, rotina de exclusão após 30 dias e um plano de resposta a incidentes (documento). Verificação de idade no servidor e antifraude por usuário ficam para depois. |
| 13 | Bloqueios externos | Sem decisão possível: credenciais de homologação da NotaAS, iPhone real e build Android seguem com o responsável. |

## O que vira código

- 1: extrato do Dono com líquido real.
- 2: pedido "Pague no balcão" no Quick.
- 3: parâmetro de provedor e trava de ambiente em `payments-create`.
- 4: tarefa de devolução, excedente na fatura, validade e limite do FUNDADOR.
- 5: migration que apaga os CPFs sem consentimento.
- 6: teste do cupom oculto.
- 11: tela de pedir cortesia por item.
- 12: aceite dos Termos registrado, job de exclusão e `docs/PLANO-RESPOSTA-INCIDENTES.md`.

## O que é ação humana

- 7: criar o projeto de produção.
- 8: perguntar ao Asaas sobre carteira digital.
- 10: pedir a liberação de tokenização das subcontas.
- 13: bloqueios externos.
