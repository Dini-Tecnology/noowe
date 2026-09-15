# Configuração por estabelecimento e capability flags

Fonte: spec §7.1. Regra de uso: `CLAUDE.md`, "a regra estrutural".

## O contrato

Nenhum código ramifica por `service_model`. O código lê **capabilities**, e as capabilities são
derivadas da configuração da unidade. Isso é o que torna verdadeira a afirmação da spec §6:
"a arquitetura deve tratar o modelo de serviço como um conjunto de flags e políticas, não como
três produtos distintos".

```ts
// packages/core/src/capabilities.ts
export type Capabilities = {
  reservations: boolean;
  virtualQueue: boolean;
  queueIsPrimaryEntry: boolean;
  tableSession: boolean;      // QR de mesa, check-in, capacidade
  guestLink: boolean;
  splitBill: boolean;
  splitModes: SplitMode[];
  serviceFee: boolean;
  staffCalls: boolean;        // garçom, sommelier, ajuda
  familyMode: boolean;
  parties: boolean;           // aniversário, junção de mesas
  comboBuilder: boolean;
  prepaidRequired: boolean;
  pickupCode: boolean;
  loyaltyMode: 'points' | 'tiers' | 'stamps' | 'mixed';
  consumptionUnit: 'table_with_guests' | 'per_person' | 'individual_cart'; // §6 unidade de consumo
  orderTracking: 'item_with_preparer' | 'table_order' | 'pickup_steps';     // §6 acompanhamento
};

export function capabilitiesFor(config: EstablishmentConfig, model: ServiceModel): Capabilities
```

`capabilitiesFor` é a **única** função no código que conhece os nomes dos três modelos.

## Parâmetros (spec §7.1)

| Parâmetro | Tipo | Default | Aplicável |
|---|---|---|---|
| `service_models[]` | enum[] | — | Todos |
| `service_fee_pct` | int (bps) | 1000 (10%) | Fine, Casual |
| `tip_presets[]` | int[] (bps) | [1000, 1500, 2000] | Fine, Casual |
| `split_modes[]` | enum[] | todos os 4 | Fine, Casual |
| `reservation_enabled` | bool | true | Fine, Casual |
| `queue_enabled` | bool | true | Fine, Casual |
| `reservation_policy` | jsonb | ver ADR-008 | Fine |
| `queue_as_primary_entry` | bool | true em Casual | Casual |
| `queue_call_tolerance_min` | int | 8 | Fine, Casual |
| `reservation_no_show_min` | int | 15 | Fine, Casual |
| `family_mode_enabled` | bool | false | Casual |
| `guest_link_enabled` | bool | true | Fine, Casual |
| `guest_link_ttl_min` | int | 180 | Fine, Casual |
| `require_guest_account` | bool | false | Fine, Casual |
| `enforce_table_capacity` | bool | true | Fine, Casual |
| `capacity_override_roles[]` | enum[] | ['maitre','manager'] | Fine, Casual |
| `split_fixed_remainder` | enum | `redistribute_unpaid` em Fine, `keep_on_table` em Casual (ADR-010) | Fine, Casual |
| `tip_allocation` | enum | `table_waiter` em Fine, `team_pool` em Casual (ADR-010) | Fine, Casual |
| `combo_discount_pct` | int (bps) | 2000 (20%) | Quick |
| `prepaid_required` | bool | true | Quick |
| `pickup_capacity_per_slot` | int | — | Quick |
| `pickup_expiry_min` | int | 30 | Quick |
| `stamps_per_reward` | int | 10 | Quick |
| `loyalty_mode` | enum | points | Todos |

> **Percentuais em basis points (int), não float.** 10% é `1000`. Isso evita reintroduzir
> ponto flutuante no caminho do cálculo de dinheiro.

## Validações de configuração

Configuração incoerente é erro de validação no salvamento, não comportamento estranho em
produção:

1. Modelo de sala com `reservation_enabled = false` **e** `queue_enabled = false` → rejeitar
   (ADR-008).
2. `quick_service` com `prepaid_required = false` → rejeitar; contradiz a invariante 6 do
   `CLAUDE.md` e o critério de aceite §5.6.
3. `split_modes` vazio com `splitBill` ativo → rejeitar.
4. `guest_link_ttl_min` maior que a duração máxima de sessão configurada → aviso.
