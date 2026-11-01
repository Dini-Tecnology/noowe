# ADR-028 — Expedição opcional e conferência do Quick

**Status:** PROVISÓRIO (2026-11-01). Origem: aditivo §5 (Chef) e pendência 2.
**Ajusta:** ADR-013 §2.2 e critérios Q1 #3/#9. **Impacta:** fatia O7, KDS, Balcão, `quick_quality_checks`.
**Regras isoladas em função nomeada:** `private.expedition_enabled` (lida de `restaurant_model_policies`), `private.release_ready_group`.

## Decisão

- A **Expedição** é opção do setup de Cozinha & Bar. Ligada, o prato pronto passa pela conferência do Chef, que libera
  a mesa inteira de uma vez; desligada, vai direto ao garçom. Combina com Fine; Casual e Quick a deixam desligada.
- A conferência obrigatória do Quick (ADR-013) passa a ser a Expedição ligada. Com ela desligada, o pedido Quick vai
  de "Em preparo" a "Pronto" sem `checking`; para o cliente nada muda além do tempo.
- "Fire Order" vira a opção Expedição; "Batch Cooking" vira o "Total do dia" do Cozinheiro e do Barman.
- Item atrasado = tempo > preparo + margem de atraso (nova configuração); destaca no KDS e avisa o Chef e o Gerente.

## Consequências

- Atualizar os critérios Q1 #3/#9 quando o autor responder; até lá os testes cobrem os dois modos.
