# Realtime e RLS

Fonte: spec §2.5, §2.6 (eventos adicionais), §7.2, §7.3.

## A armadilha do Supabase que precisa ser dita

**O Realtime do Supabase respeita RLS.** Isso tem duas consequências que se contradizem na
prática e derrubam projetos:

1. Política RLS mal escrita **vaza dados entre estabelecimentos** por um canal de subscription
   que ninguém está olhando.
2. Política RLS restritiva demais faz o KDS **não receber eventos** e o time gastar dias
   procurando bug no cliente.

Portanto: toda política RLS precisa de teste que rode como cada papel e verifique o que chega
**e** o que não chega no canal.

## Papéis e escopo (spec §2.4)

| Papel | Enxerga |
|---|---|
| `dono` | Todas as unidades do grupo |
| `gerente` | A unidade inteira |
| `maitre` | Mesas, reservas e fila da unidade |
| `chef` | Todos os tickets da unidade |
| `cozinheiro` / `barman` | **Apenas os itens da própria estação** |
| `garcom` | **Apenas as próprias mesas** (`tables.assigned_waiter_id`) |
| cliente | Apenas as sessões em que é participante e os próprios pedidos |

A função base de toda política:

```sql
create or replace function auth_establishment_ids() returns uuid[]
language sql stable security definer as $$
  select coalesce(array_agg(establishment_id), '{}') from staff_members
   where user_id = auth.uid()
$$;
```

O caso do garçom e o do cozinheiro são os que exigem política de linha, não só de tenancy —
e são justamente os que a spec especifica explicitamente ("o garçom vê as próprias mesas",
"canais por estação, para que o KDS receba apenas o que lhe diz respeito").

## Canais

Um canal por **estabelecimento** e, no KDS, um por **estação**:

```
establishment:{id}:tables        -> mapa de salão, fila virtual
establishment:{id}:orders        -> painel de pedidos
establishment:{id}:station:{sid} -> KDS de uma estação
session:{id}                     -> participantes de uma mesa (comanda, split, status)
user:{id}                        -> notificações pessoais
```

O cliente assina `session:{id}` e `user:{id}` e nada mais. Ele **não** assina o canal do
estabelecimento.

## Eventos (spec §2.5 e §2.6)

| Evento | Origem | Efeito |
|---|---|---|
| `order.created` | app, garçom, balcão | ticket no KDS, painel, notificação |
| `order.item.status_changed` | estação | progresso por item no app, expedição |
| `order.ready` | KDS (convergência) | push ao cliente, alerta ao garçom |
| `table.status_changed` | garçom, maitre, pagamento | mapa de mesas, libera fila |
| `waiter.call` | app | tela de chamados do garçom |
| `payment.completed` | cliente ou TAP to Pay | fecha parcela, fiscal, fidelidade |
| `reservation.status_changed` | cliente ou maitre | agenda, mapa, push |
| `queue.position_changed` | motor de fila | push, painel de salão |
| `session.opened` | check-in ou QR | mesa `occupied`, garçom recebe a mesa |
| `guest_link.created` | anfitrião | token + código curto, autoria registrada |
| `participant.joined` | convidado | atualiza `occupied_seats`, avisa mesa e garçom |
| `participant.join_blocked` | motor de capacidade | solicitação na tela do maitre |
| `participant.left` | convidado ou garçom | reatribui itens, recalcula divisão |
| `session.closed` | pagamento total | mesa `available`, convite revogado, fiscal, fidelidade |

## Segurança do convite (spec §7.2)

O código curto de 6 dígitos é o ponto fraco óbvio: 10⁶ combinações são forçáveis em minutos.

- **Nunca** expor `guest_links` a `select` direto pelo cliente. A entrada por código passa por
  Edge Function.
- Rate limit por IP e por sessão: 5 tentativas, depois backoff. Registrar tentativas.
- Guardar `token_hash` e `short_code_hash`, não os valores em claro.
- `expires_at` verificado no servidor. Código expirado abre tela explicativa, **nunca** cria
  sessão nova (spec §2.6).

## Resiliência (spec §7.3)

- **Modo degradado:** a comanda vive em estado local no app e sincroniza ao reconectar. O
  painel permite lançamento manual. Usar fila de mutações com `idempotency_key` gerada no
  cliente, para que o replay não duplique.
- Webhook de pagamento é a fonte da verdade, não a tela de sucesso do app.
- KDS offline: pedido pago fica enfileirado e entra na produção preservando a ordem de chegada
  (spec §5.5).
