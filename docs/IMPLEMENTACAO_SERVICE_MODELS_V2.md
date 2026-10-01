# Matriz de implementação — Service Models V2

Fonte funcional: `NOOWE_Service_Types_Auditoria_Agente_IA.md`.

| Jornada | Capacidade V2 | Entrada | Produção/pagamento | Operação | Cobertura |
|---|---|---|---|---|---|
| Fine Dining | reserva obrigatória, fila controlada, mesa, convidados, chamadas, split | `customer_resolve_service_qr` + `customer_check_in` | pós-consumo; pedido ligado à mesa ou fila | KDS por item; garçom/sommelier/ajuda/conta | contrato e invariantes SQL |
| Casual Dining | fila principal, reserva opcional, pedido na espera, mesa, família, split | `customer_resolve_service_qr` + `customer_check_in` | pós-consumo; pedido da fila migra atomicamente para a mesa | KDS por item; garçom/ajuda/conta | contrato e invariantes SQL |
| Quick Service | QR de balcão, combo, pré-pago, slot, código, conferência, selos | `customer_resolve_service_qr` | `customer_create_order_v2` → `customer_start_payment`; KDS somente após confirmação | produção → conferência → pronto → retirada | `14_service_model_runtime_v2.sql` |

## Invariantes aplicados no banco

- `orders.service_model` e a origem da jornada são persistidos; Quick rejeita mesa/fila e salão exige exatamente uma origem.
- Valores novos são calculados e persistidos em centavos; campos numéricos antigos permanecem em dual-write durante o rollout.
- Pagamento simulado passa pela mesma fronteira idempotente de evento esperada para um webhook real.
- O status de execução é separado do pagamento e deriva dos itens; Quick não entra no KDS sem pagamento nem fica pronto sem conferência.
- QR, link, @username e acompanhante consultam capacidade; excedentes viram solicitação auditável.
- Divisão aceita apenas modos habilitados em `restaurant_model_policies` e preserva soma exata em centavos.
- Cancelamento libera o slot e registra estorno da transação simulada quando aplicável.

## Compatibilidade e rollout

- `restaurants.service_type` e `restaurant_service_configs` continuam como ponte de descoberta/configuração.
- `restaurant_model_configs` + `restaurant_model_policies` são a fonte canônica.
- `get_restaurant_model_capabilities` delega ao contrato V2; consumidores novos chamam explicitamente a versão V2.
- Migrações anteriores não são alteradas e nenhum dado é removido nesta etapa.
