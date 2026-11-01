# ADR-027 — Vários serviços sem "primário" e Fine só por reserva

**Status:** PROVISÓRIO (2026-11-01). Origem: aditivo §3 e §7.2 (pendências 3 e 4).
**Substitui parcialmente:** ADR-008 (janelas sem reserva no Fine). **Complementa:** ADR-003, ADR-017.
**Impacta:** fatias O6 e O9, página do restaurante, cardápio, KDS, Central de Configuração.
**Regras isoladas em função nomeada:** `private.restaurant_entry_doors` (entradas por serviço ativo), `private.menu_item_visible_in_model`, `private.fine_limits_for_slot`.

## Decisão

- Cada serviço ativo é uma entrada na página do restaurante: Fine → "Reservar experiência"; Casual → QR, Fila e Reserva;
  Quick → "Pedir para retirar". O conceito de "primário" sai da UI; `restaurants.service_type` permanece só como legado interno.
- **Fine só por reserva** (o documento prevalece sobre a janela do ADR-008); a trava `session_needs_entry_origin` fica.
  Com Fine e Casual juntos, a escolha "Experiência Fine" ou "Reserva comum" acontece **na reserva**; o QR segue o
  Casual. O ADR-003 permanece: o cliente não escolhe o modelo pelo QR.
- O restaurante pode limitar o Fine a certas áreas ou horários (`fine_limits_for_slot`).
- Cada item do cardápio indica em quais serviços aparece; no KDS cada item mostra a origem (Mesa 7 ou Retirada #123).
- Taxa de serviço ou gorjeta é definida por serviço (ver ADR-029).

## Consequências

- `restaurants.service_models` (ADR-017) continua a fonte para a Home; ocultar os 8 serviços "Em breve" não remove
  enums do banco.
