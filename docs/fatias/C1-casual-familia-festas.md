# C1 — Casual: modo família, aniversário e festas

**Objetivo:** os diferenciais de sala do Casual Dining sobre o motor de grupo já pronto.
**Depende de:** G1 (e G3 para os modos de conta de festa)
**Spec:** §4.2 (etapas 3 e 5), §4.4 ("modo família", "aniversário e festas"), §4.3

## Entregáveis

**Modo família**
- Cardápio kids, solicitação de cadeirão, registro de alergias, atividades para crianças
- **Alergia vira alerta obrigatório no ticket do KDS** e exige confirmação do chef antes da
  expedição (spec §4.4)
- Pedidos de apoio (cadeirão, kit) vão para a tela de assistência do garçom
- `seat_count = 0` para criança de colo (ADR-007)

**Aniversário e festas**
- Indicação do aniversariante, escolha de mimos (incluídos ou pagos)
- Junção de mesas: `tables.merged_into_id`, refletida no mapa de salão
- **Modo de conta do grupo:** conta única, dividida por mesa, ou individual — a escolha define
  como as parcelas aparecem no fechamento (spec §4.4)
- Cortesias de comemoração passam por aprovação do gerente, com valor e motivo registrados

## Critérios de aceite

1. Alergias registradas aparecem **em destaque** no ticket do KDS (spec §4.6).
2. Alergia crítica **bloqueia a expedição** até confirmação explícita do chef (spec §4.5).
3. Junção de mesas para festa reflete no mapa de salão e produz uma conta consolidada coerente
   com o modo escolhido (spec §4.6).
4. Mudança de tamanho do grupo recalcula a alocação, pode exigir junção, e recalcula
   automaticamente a divisão igual (spec §4.5).
5. Cortesia de aniversário fica registrada com valor, motivo e autor da aprovação.
6. Criança de colo entra com `seat_count = 0` mas continua visível ao garçom para cadeirão,
   cardápio kids e alergia (ADR-007).

## Fora de escopo

O motor de convite e capacidade (G2) e os quatro modos de divisão (G3) — aqui só o que é
específico de família e comemoração.
