# ADR-003 — Coexistência de modelos na mesma unidade

**Status:** ACEITO (2026-09-14) — default mantido; escolha delegada pelo responsável do produto à recomendação técnica do plano de aderência
**Origem:** spec §8.1, terceira decisão em aberto; princípio declarado em §1.3
**Impacta:** Fatia F3 (config), Fatia G1 (sessão de mesa), Fatia Q1 (Quick Service)

## Questão

A spec §1.3 afirma que os modelos "podem coexistir (ex.: um restaurante casual com balcão
express)", e §8.1 registra como aberto: "definir como o cliente escolhe o formato ao entrar
(QR de mesa versus balcão express)".

## Decisão proposta

**O cliente nunca escolhe o modelo de serviço. O ponto de entrada o determina, e ele é gravado
no pedido.**

| Ponto de entrada | `service_model` resultante |
|---|---|
| QR físico de mesa | o modelo de sala configurado na unidade (`fine_dining` ou `casual_dining`) |
| QR de balcão / ponto de retirada | `quick_service` |
| Pedido pelo app sem contexto de mesa (Skip the Line) | `quick_service` |
| Chamada da fila virtual ou check-in de reserva | modelo de sala da unidade |

`orders.service_model` é gravado na criação e **nunca muda**. É ele que decide se a conta
fecha antes ou depois do consumo, se há split, se há taxa de serviço.

## Por que não uma tela de escolha

Porque o modelo de serviço não é uma preferência do cliente: é uma consequência física de onde
ele está. Quem está sentado numa mesa não pode escolher "pagar antecipado e retirar no balcão"
— não há balcão na jornada dele. Uma tela de escolha convida a estados incoerentes (pedido
`quick_service` associado a uma `table_session` aberta) e obriga toda regra de fechamento a
tratar o caso impossível.

## Consequências

- `qr_codes` precisa de tipo: `table` (aponta para `table_id`) ou `counter` (aponta para
  `pickup_point_id`). São dois fluxos de leitura distintos a partir da mesma tela de câmera.
- `establishments.service_models[]` é a lista de modelos habilitados; a unidade casual com
  balcão express tem `['casual_dining','quick_service']`.
- Constraint: um pedido com `service_model = 'quick_service'` não pode ter `table_session_id`
  preenchido, e vice-versa. Garantir no banco.
