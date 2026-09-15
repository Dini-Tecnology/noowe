# S1 — Chamados e ações do garçom na mesa

**Objetivo:** o cliente chama a equipe pelo app; o garçom age pela mesa sem redigitar nada.
**Depende de:** G1
**Spec:** §3.4 ("chamados e fidelidade"), §3.2 (etapa 12), §3.3, §4.3

## Entregáveis

**Banco**
- `service_calls`: `session_id`, `table_id`, `type`, `status`, `created_at`, `acknowledged_at`
- Tipos: `garcom`, `sommelier`, `ajuda` (spec §3.4). `sommelier` só aparece com a capability
  de Fine (D1)

**Servidor**
- Evento `waiter.call` roteado para o garçom responsável pela mesa
- Ações do garçom pelo cliente: lançar pedido, ajustar comanda, cobrar na mesa (TAP to Pay)

**App do cliente**
- Chamar equipe, com confirmação e previsão de atendimento

**Painel (garçom)**
- Tela "Minhas mesas" e tela de chamados, com tipo, mesa e tempo de espera
- Ações na mesa e cobrança por NFC, PIX ou cartão (spec §3.3)

## Critérios de aceite

1. Chamados de garçom e sommelier chegam à tela do **garçom responsável** pela mesa, com
   identificação da mesa (spec §3.6).
2. O cliente vê confirmação do chamado e previsão de atendimento (spec §3.4).
3. O chamado é discreto: não interrompe o serviço com alarme sonoro por padrão (spec §3.1,
   "a tecnologia precisa ser discreta").
4. Pedido lançado pelo garçom pelo painel segue exatamente o mesmo caminho do pedido do app —
   mesmo roteamento, mesmo KDS, `source` diferente (spec §1.3).
5. Cobrança na mesa por TAP to Pay quita a parcela correspondente e atribui a gorjeta ao garçom.

## Fora de escopo

Harmonização e sommelier de IA (D1). Assistência de modo família (C1).
