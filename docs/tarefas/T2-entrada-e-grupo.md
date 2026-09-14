# T2 — Entrada e grupo (E1, E2, G1, G2, G3)

**Fatias:** [E1](../fatias/E1-reservas.md) · [E2](../fatias/E2-fila-virtual.md) · [G1](../fatias/G1-sessao-qr-checkin.md) · [G2](../fatias/G2-convite-capacidade.md) · [G3](../fatias/G3-split-pagamento-parcial.md)
**Spec:** §2.6 (o motor de grupo inteiro), §3.4, §4.4, §7.1

> §2.6 é o coração da spec v2 e a parte com maior distância entre o que está escrito e o que existe.
> A sessão de mesa está bem servida (invariante 3 atendida por índice único). O **convite** e a
> **capacidade** não têm substrato nenhum: `grep "seat_count|capacity_request|occupied_seats"` nas
> 81 migrations retorna **zero linhas**.

---

## E1 — Reservas

### T-E1-01 · NOVO — `confirmation_code` e `occasion` na reserva
**Tipo** banco **Tamanho** P
**Spec** §3.4 ("recebe código de confirmação e um link de jornada compartilhável"), §4.2 etapa 3 (aniversário marca a ocasião na reserva)
**Gap** Nenhuma das duas colunas existe.
**Aceite** Reserva criada devolve código de confirmação; ocasião marcada aparece para o maitre.

### T-E1-02 · AJUSTE — Enum de status conforme a spec
**Tipo** banco **Tamanho** P
**Spec** §2.2, §3.4 (`confirmed → seated | waiting | cancelled`)
**Gap** O enum atual é `pending/confirmed/...` e não tem `seated`. `waiting` é usado para lista de
espera segundo §2.2, o que colide com E2 — resolver junto com T-E2-01.
**Aceite** Check-in move a reserva para `seated` e a mesa para `occupied`.

### T-E1-03 · AJUSTE — `party_size <= tables.seats` da mesa alocada
**Tipo** banco/servidor **Tamanho** M
**Spec** §3.4 ("`partySize` da reserva é validado contra `Table.seats` na alocação. Reserva maior que a mesa exige junção de mesas antes do check-in")
**Gap** **A validação é da capacidade agregada da casa, não da mesa**:
`20260803170000_client_production_backend.sql:408-413` compara `sum(seats)` com `sum(party_size)`.
Nada impede check-in de grupo maior que a mesa alocada.
**Aceite** Alocar grupo de 6 numa mesa de 4 é rejeitado, com a junção de mesas oferecida como saída (T-C1-03).

### T-E1-04 · NOVO — No-show libera a mesa
**Tipo** servidor **Tamanho** M
**Spec** §3.5 ("após a tolerância configurada, a mesa é liberada automaticamente para a fila virtual"), ADR-002
**Gap** `waitlist_entries.no_show_at` existe (`20260427101000_...:338`) e **nada o preenche
automaticamente**; não há liberação de mesa nem job.
**Aceite** Passada a tolerância configurada, a reserva vira no-show e a mesa entra na oferta da fila.

### T-E1-05 · NOVO — `reservation_required` como gate real de consumo
**Tipo** servidor **Tamanho** M **Bloqueia** T-G1-01
**Spec** §3.1 ("não existe consumo sem reserva ou posição de fila registrada"), §3.6, §7.1
**Gap** A coluna existe (`restaurant_service_configs:1137`) e **não é lida por nenhum caminho de consumo**.
**Aceite** Em Fine Dining com `reservation_required`, abrir sessão sem reserva nem posição de fila é rejeitado.

### T-E1-06 · NOVO — Política de reserva por janela
**Tipo** banco **Tamanho** M
**Spec** ADR-008 ("Fine Dining sem reserva — definir se a casa pode desligar a obrigatoriedade em dias específicos")
**Gap** Ausente. Hoje a obrigatoriedade só poderia ser global.
**Aceite** A casa desliga a obrigatoriedade para uma janela específica sem mudar a configuração permanente.

### T-E1-07 · NOVO — Link de jornada compartilhável desde a reserva
**Tipo** servidor/app **Tamanho** M **Depende de** T-G2-01
**Spec** §3.4, §6.1 UC-02 ("Fine Dining: desde a reserva; Casual: na mesa, após o check-in")
**Gap** `reservation_guests.invite_token` existe (`20260803170000_...:423-435`) mas não é o mesmo motor de
`table_session_invites` — são dois convites diferentes para a mesma ideia.
**Aceite** O link enviado com a reserva coloca o convidado na sessão quando ela abre, sem gerar um segundo convite.

---

## E2 — Fila virtual

### T-E2-01 · DECISÃO + AJUSTE — Unificar `waitlist_entries` e `queue_entries`
**Tipo** banco **Tamanho** M **Ver** T-X-03
**Gap** **Duas tabelas de fila concorrentes**: `waitlist_entries` (`20260427101000_...:319-341`, usada
pelo produto) e `queue_entries` (`20260430180000_...:305-320`, do domínio de balada, **sem RLS**,
com `priority_level_id`). São modelos diferentes da mesma coisa.
**Aceite** Uma única tabela de fila; a outra removida ou explicitamente escopada a outro domínio com nome que o diga.

### T-E2-02 · AJUSTE — Consumo na espera como pedido real
**Tipo** banco/servidor **Tamanho** G
**Spec** §4.4 ("esses itens são vinculados ao grupo e migram automaticamente para a comanda quando a mesa é atribuída"), §4.6
**Gap** O consumo na espera é **`jsonb` dentro da própria entrada** (`waitlist_entries.waitlist_bar_orders`,
`20260427101000_...:330`), não pedidos com FK. Os itens teriam de ser relançados na alocação — o
oposto do critério.
**Aceite** Bebida pedida na espera é um `order_item` desde o início e aparece na comanda da mesa sem relançamento.

### T-E2-03 · NOVO — Migração automática do consumo para a comanda
**Tipo** servidor **Tamanho** M **Depende de** T-E2-02, T-G1-01
**Spec** §4.6 ("itens pedidos durante a espera aparecem na comanda da mesa após a alocação, sem relançamento")
**Aceite** Alocar a mesa move os itens da espera para a sessão, preservando horário e responsável.

### T-E2-04 · NOVO — Recálculo contínuo de posição
**Tipo** servidor **Tamanho** M
**Spec** §4.4 ("a posição é recalculada continuamente conforme mesas são liberadas"), §4.6 ("a posição muda no app sem recarregar a tela")
**Gap** `position` é `integer not null` escrito manualmente; não há motor de recálculo.
**Aceite** Liberar uma mesa reordena a fila e a posição muda no app sem recarregar.

### T-E2-05 · NOVO — Tolerância de chamada e queda de posição
**Tipo** servidor **Tamanho** M
**Spec** §3.4 ("a chamada da fila expira após tempo configurável e devolve o cliente ao fim da fila com aviso"), §4.5, ADR-002
**Gap** Não existe `tolerance_expires_at` nem queda de posição. ADR-002 sem implementação.
**Aceite** Grupo que não se apresenta cai de posição e, depois, sai da fila — com aviso no app em ambos os passos.

### T-E2-06 · NOVO — Consumo vira conta de balcão quando o grupo desiste
**Tipo** servidor **Tamanho** M **Depende de** T-E2-02
**Spec** §4.5 ("o consumo permanece cobrável e é convertido em conta de balcão")
**Aceite** Grupo sai da fila com consumo em aberto e o valor vira conta de balcão cobrável.

### T-E2-07 · NOVO — Só oferecer posição sem mesa compatível
**Tipo** servidor **Tamanho** P
**Spec** §3.4 ("a fila virtual só oferece posição quando não há mesa compatível com o tamanho do grupo")
**Aceite** Havendo mesa livre compatível com o grupo, o app oferece entrada direta, não posição na fila.

### T-E2-08 · NOVO — Prioridade configurável entre reserva e fila
**Tipo** servidor **Tamanho** M **Depende de** T-E2-04, T-E1-03
**Spec** §4.4 ("a reserva permanece disponível como opção e ocupa a mesma agenda do maitre; reserva e fila competem pelo mesmo mapa de mesas, com prioridade configurável")
**Gap** Sem tarefa e sem implementação. Hoje reserva e fila não disputam o mesmo mapa: a reserva valida capacidade
agregada da casa (T-E1-03) e a fila tem posição escrita à mão (T-E2-04).
**Aceite** Com uma mesa liberada e um grupo de reserva e outro de fila compatíveis, a mesa vai para quem a política configurada indica, e a regra fica numa função única.

---

## G1 — Sessão de mesa, QR e check-in

> A fatia mais bem servida do repositório. **Invariante 3 atendida:** índice único parcial
> `uq_table_sessions_one_active_per_table` (`20260815211000_table_qr_full_flow.sql:25-27`), com
> migração de dados que fecha duplicatas (`:11-23`). Ler o mesmo QR entra na sessão existente.
> O que falta é a procedência e o estado de fechamento.

### T-G1-01 · NOVO — Origem de entrada obrigatória na sessão
**Tipo** banco **Tamanho** M **Bloqueia** todo o G2 e o G3 **Depende de** T-E1-05
**Spec** §3.1 ("não existe consumo sem reserva ou posição de fila registrada"), §3.6, ADR-008
**Gap** **É a dependência estrutural do grafo de fatias.** `table_sessions` **não tem `reservation_id`
nem `queue_entry_id`** (`20260430180000_...:1346-1367`; reverificado, o `grep` retorna zero). Abrir
sessão sem reserva nem fila é o caminho normal hoje.
**Fazer** Duas colunas nullable — `reservation_id` e `waitlist_entry_id`, nome no banco do `queue_entry_id` da spec (ADR-009) — + constraint `session_needs_entry_origin` que exige uma das duas quando a
capability de porta de entrada controlada está ligada.
**Aceite** Em Fine Dining, abrir sessão sem reserva nem posição de fila é rejeitado pelo banco.

### T-G1-02 · NOVO — Estado `billing` e QR que abre o fechamento
**Tipo** banco/app **Tamanho** M **Bloqueia** T-G3-05
**Spec** §3.4 ("se a mesa já estiver em `billing`, o QR passa a abrir diretamente o fechamento de conta em vez do cardápio"), §2.2 (`Table.status` inclui `billing`)
**Gap** **`grep "'billing'"` nas migrations retorna zero.** O estado não existe; o QR nunca abre o fechamento.
**Aceite** Mesa em `billing` faz o QR abrir a tela de fechamento, não o cardápio.

### T-G1-03 · NOVO — `qr_codes` com tipo `table | counter`
**Tipo** banco **Tamanho** P **Ver** T-X-04
**Spec** ADR-003, §8.1 ("coexistência de modelos: QR de mesa versus balcão express")
**Gap** Só existe `table_qr_codes`; não há QR de balcão, então uma unidade que opere os dois modelos não
tem como distinguir a porta de entrada.
**Aceite** QR de balcão abre a jornada Quick Service na mesma unidade em que o QR de mesa abre a sessão.

### T-G1-04 · NOVO — Teste de concorrência da sessão única
**Tipo** teste **Tamanho** P **Depende de** T-F2-08 **Invariante** 3
**Spec** §7.2 ("uma mesa só pode ter uma `TableSession` aberta por vez; a restrição precisa ser garantida no banco")
**Gap** O índice único existe e **não tem teste**.
**Aceite** Duas leituras simultâneas do mesmo QR produzem uma sessão e dois participantes.

### T-G1-05 · NOVO — Abertura de sessão em menos de 3 segundos
**Tipo** teste **Tamanho** P
**Spec** §3.6 ("ler o QR da mesa associa o cliente à mesa correta e abre a comanda em menos de 3 segundos")
**Gap** Não há medição.
**Aceite** Teste de performance mede QR → comanda aberta e falha acima de 3 s.

---

## G2 — Convite por link e capacidade

### T-G2-01 · NOVO — Capacidade da sessão (invariante 7 não tem substrato)
**Tipo** banco **Tamanho** G **Invariante** 7 **Bloqueia** T-G2-02, T-C1-06
**Spec** §2.6 ("o check-in compara pessoas declaradas + convidados que entraram com `Table.seats`. Enquanto `occupiedSeats < capacity`, a entrada é automática")
**Gap** **`grep "seat_count|capacity_request|occupied_seats"` nas 81 migrations retorna zero.** Não existe
`session_participants.seat_count`, não existe `capacity` na sessão, não existe contagem de lugares
ocupados. ADR-007 inteiro pendente.
**Fazer** `table_sessions.capacity` herdada de `Table.seats`; `seat_count` por participante (default 1,
`0` para criança de colo — ADR-007); `occupied_seats` mantido por trigger.
**Aceite** Entrada que caberia na mesa entra automática; a que estoura é barrada — nunca em silêncio.

### T-G2-02 · NOVO — Fila de exceção de lotação para o maitre
**Tipo** banco/servidor/app **Tamanho** G **Invariante** 7 **Depende de** T-G2-01, T-F2-04
**Spec** §2.6 ("ao atingir a capacidade, novas entradas ficam em pendente de aprovação e a solicitação aparece para o maitre … que pode aprovar com exceção, trocar a mesa, juntar mesas ou recusar"), §3.6, §4.6, §6.1 UC-04/UC-05
**Gap** `capacity_requests` não existe. Não há fila de exceções, e `capacity_override_roles[]` (§7.1) não
tem substrato.
**Aceite**
- Tentativa acima da capacidade gera solicitação pendente com mesa, grupo e excedente — nunca recusa muda nem aprovação automática.
- As quatro saídas do maitre existem e a decisão grava `audit_log` com autor, motivo e horário.

### T-G2-03 · AJUSTE — `token_hash` em vez de token em claro
**Tipo** banco **Tamanho** P
**Spec** §7.2 ("tokens de convite devem ser aleatórios, de uso limitado e revogáveis")
**Gap** `table_session_invites.token` é armazenado **em claro** (`20260814110000_...:62`).
**Aceite** O banco guarda apenas o hash; o token em claro existe só na resposta da criação.

### T-G2-04 · NOVO — Código curto de 6 dígitos com limite de tentativas
**Tipo** banco/servidor **Tamanho** M
**Spec** §2.6 ("link, QR na tela do próprio celular ou código de 6 dígitos ditado em voz alta"), §7.2 ("o código curto de 6 dígitos exige limite de tentativas para evitar adivinhação")
**Gap** Não existe `short_code`, nem `short_code_hash`, nem `max_uses`/`uses`.
**Aceite** Código de 6 dígitos entra na sessão; força bruta é bloqueada por rate limit por sessão e por IP.

### T-G2-05 · NOVO — Edge Function de entrada por código curto
**Tipo** servidor **Tamanho** M **Depende de** T-G2-04
**Spec** §7.2
**Gap** `edge_rate_limits` existe (`20260624121000_...`), e as 5 Edge Functions publicadas
(`platform/supabase/functions/`) são de e-mail, push e staff — **nenhuma de convite**.
**Aceite** Entrada por código passa por Edge Function com rate limit, sem expor a tabela de convites.

### T-G2-06 · AJUSTE — TTL do convite vem da configuração e expira no fechamento
**Tipo** banco/servidor **Tamanho** P **Depende de** T-F3-01
**Spec** §2.6 ("o convite expira quando a conta é encerrada, quando o anfitrião o revoga ou após o tempo configurado em `guest_link_ttl_min`")
**Gap** Expira por TTL e por revogação, mas **não ao encerrar a conta**; e o TTL de 6h é literal no default
da coluna (`20260814110000_...:65`), não configuração.
**Aceite** Encerrar a conta invalida o convite na hora; o TTL sai de `guest_link_ttl_min`.

### T-G2-07 · NOVO — Convite expirado abre tela explicativa, nunca sessão nova
**Tipo** app **Tamanho** P
**Spec** §2.6 ("convite expirado abre uma tela explicativa, nunca uma sessão nova")
**Aceite** Abrir link expirado mostra a explicação e não cria sessão.

### T-G2-08 · NOVO — Participante que sai continua responsável
**Tipo** servidor **Tamanho** M **Depende de** T-G3-02
**Spec** §2.6 ("convidado que sai antes do pagamento continua responsável pelos itens atribuídos a ele; o saldo volta para a mesa e fica sinalizado ao garçom"), evento `participant.left`
**Gap** Sem implementação — não existe saldo de mesa (ver G3).
**Aceite** Marcar participante como `left` devolve o saldo à mesa e sinaliza ao garçom.

### T-G2-09 · NOVO — Aviso de responsabilidade por convidado sem conta
**Tipo** app **Tamanho** P
**Spec** ADR-006 ("convidado sem conta — definir se o acesso por link permite consumo apenas com nome")
**Gap** Convidado sem conta já é suportado (`20260815200000_...:40-50`, `user_id` nullable), mas o anfitrião
não é avisado de que responde pelo saldo.
**Aceite** O anfitrião vê e confirma a responsabilidade antes de o convidado sem conta pedir.

### T-G2-10 · NOVO — Eventos do motor de grupo
**Tipo** servidor **Tamanho** M **Depende de** T-G2-01
**Spec** §2.6, tabela de eventos adicionais
**Gap** Dos seis eventos especificados, `session.opened` e `participant.joined` existem implicitamente;
`participant.join_blocked`, `participant.left` e `session.closed` não têm emissor.
**Aceite** Os seis eventos de §2.6 são emitidos e chegam ao destino descrito na tabela.

### T-G2-11 · NOVO — Anfitrião libera lugares
**Tipo** servidor/app **Tamanho** P **Depende de** T-G2-01
**Spec** §2.6 ("se o grupo diminui, o anfitrião libera lugares e a fila virtual passa a considerar a mesa como parcialmente livre apenas quando a sessão é encerrada")
**Gap** Sem tarefa e sem implementação.
**Aceite** Liberar lugares reduz `occupied_seats` e abre vaga para convidado, mas a mesa só volta à oferta da fila quando a sessão fecha.

### T-G2-12 · NOVO — Convite em até dois toques
**Tipo** app/teste **Tamanho** P
**Spec** §4.6 ("ler o QR da mesa abre a sessão do grupo e permite gerar o convite em até dois toques")
**Gap** O critério está na fatia G2 (critério 9) e não virou tarefa. Hoje o convite sai por `Share` a partir de
`CartScreen.tsx:57-62`, fora do caminho aberto pelo QR.
**Aceite** Teste de UI: da tela aberta pelo QR até o convite pronto para compartilhar, no máximo dois toques.

---

## G3 — Divisão de conta e pagamento parcial

### T-G3-01 · AJUSTE — Tirar do app toda a aritmética de cobrança
**Tipo** app **Tamanho** M **Invariante** 2 **Depende de** T-G3-02
**Spec** §7.2 · regra de `CLAUDE.md` ("o app React Native exibe valores, nunca os determina")
**Gap** Todo valor cobrado é calculado no React Native e **o servidor não recalcula**:

| Arquivo:linha | Expressão | O que produz |
|---|---|---|
| `production/CartScreen.tsx:84-85` | `cart.total * (SERVICE_FEE_PCT/100)` | taxa e total exibido |
| `production/SplitBillScreen.tsx:58` | `subtotal * (1 + feePct/100)` | total com taxa |
| `production/SplitBillScreen.tsx:67` | `subtotal / participantCount` | **parcela do modo igual, em float** |
| `production/SplitBillScreen.tsx:70-71` | `reduce(... + item.totalPrice)` | parcela do modo por item |
| `production/SplitBillScreen.tsx:76` | `baseAmount * (1 + feePct/100)` | valor da minha parte |
| `production/TipPaymentScreen.tsx:41-43` | taxa, gorjeta e soma | **valor cobrado**, enviado como `baseAmount` à RPC (`:52`) |
| `production/ComboBuilderScreen.tsx:65-66` | desconto e total do combo | total do combo |
| `club/TicketPurchaseScreen.tsx:249` | `pricePerTicket * quantity` | total de ingressos |
| `pub-bar/RoundBuilderSheet.tsx:289` | `Number(price) * quantity` | total da rodada |
| `pub-bar/TabPaymentScreen.tsx:215` | `Number(unit_price) * quantity` | total da comanda |
| `restaurant/.../WaiterTapToPayScreen.tsx:56-57` | gorjeta e soma | valor cobrado no TAP to Pay |

**Aceite** Nenhuma expressão aritmética sobre dinheiro fora de `shared/money`; o app só exibe o que o servidor devolveu.

### T-G3-02 · NOVO — `bill_shares` ancorado na sessão
**Tipo** banco **Tamanho** M **Invariante** 4 **Depende de** T-F2-01, T-G1-01
**Spec** §7.2 ("pagamentos parciais exigem uma tabela de parcelas de conta (`bill_shares`) com participante, valor, status e referência da transação — é o que garante consistência do split")
**Gap** Existe `payment_splits` (`20260430180000_...:954-972`), com schema próximo — mas **sem RLS**,
ancorada em `order_id` e não na sessão, e **nada verifica que a soma das parcelas iguala o total**.
**Aceite** Parcela pertence à sessão, tem RLS, e a soma é verificada transacionalmente no fechamento.

### T-G3-03 · NOVO — `split_preview` / `split_commit` / `pay_share`
**Tipo** servidor **Tamanho** G **Invariante** 2, 4 **Depende de** T-G3-02
**Spec** §3.4, §4.4
**Gap** **As três não existem.** A única RPC, `restaurant_calculate_split`
(`20260624210000_waiter_operations_rpc.sql:168-226`), é `stable` — não grava.
**Aceite** `split_commit` é a única porta de gravação de parcela e valida a soma antes de gravar.

### T-G3-04 · AJUSTE — Os quatro modos exatos da spec
**Tipo** servidor **Tamanho** M **Depende de** T-G3-03
**Spec** §3.4 (individual, igual, seletivo, valor fixo), §4.4 (meus itens, igual, por item, valor fixo), ADR-010 — os mesmos quatro modos; as duas regras de fechamento que diferem entre as seções são política da unidade
**Gap** `restaurant_calculate_split` suporta `equal | individual | percentage` — **três modos, e
`percentage` não é nenhum dos quatro da spec.** Faltam `by_owner`, `by_item` e `fixed_amount` como
modos de gravação. No modo individual, **itens compartilhados são rateados entre os participantes**
(§3.4) — regra que não existe hoje.
**Aceite** Os quatro modos existem com os nomes canônicos; `percentage` é removido ou mapeado explicitamente; o destino do restante no valor fixo segue `split_fixed_remainder` (ADR-010).

### T-G3-05 · NOVO — Mesa em `billing` e encerramento só em saldo zero
**Tipo** servidor **Tamanho** M **Depende de** T-G1-02, T-G3-02
**Spec** §3.4 ("a conta só é encerrada quando a soma dos pagamentos atinge o total; enquanto isso a mesa permanece em `billing`"), §3.6
**Aceite** Pagamento parcial mantém a mesa em `billing`; o encerramento só ocorre com saldo zero.

### T-G3-06 · NOVO — Redistribuição do resto (ADR-001)
**Tipo** servidor **Tamanho** P **Depende de** T-G3-03 **Invariante** 4
**Spec** §4.4 ("arredondando … para não deixar saldo residual"), §8.1 (decisão em aberto), ADR-001
**Gap** `restaurant_calculate_split` arredonda com `round(v_total / greatest(p_parts,1), 2)`
(`:201`) — **sem redistribuição de resto**, violando ADR-001.
**Fazer** Isolar numa função única e nomeada, para trocar a política depois numa linha (`CLAUDE.md`).
**Aceite** `max(parcela) − min(parcela) ≤ 1` centavo no modo igual.

### T-G3-07 · NOVO — Teste de propriedade da soma das parcelas
**Tipo** teste **Tamanho** M **Depende de** T-F2-08, T-G3-03 **Invariante** 4
**Spec** §3.6 ("as quatro formas de divisão produzem soma exatamente igual ao total da conta, sem centavos perdidos"), §4.6
**Gap** Não existe teste de propriedade. É o critério que a spec cita duas vezes e a fatia exige como
propriedade, não exemplo.
**Aceite** Para qualquer total, número de participantes e modo, `sum(parcelas) == total`. Teste de propriedade, não de exemplo.

### T-G3-08 · NOVO — Abandono, walk-out e reabertura
**Tipo** servidor **Tamanho** M **Depende de** T-G3-05, T-F2-04
**Spec** §3.5 ("se um convidado abandona o pagamento, o valor volta ao pool e é redistribuído entre os não pagos"; "walk-out: a mesa fica em `billing` e gera alerta para o gerente com o saldo em aberto"), ADR-004
**Aceite**
- Abandono devolve o valor ao pool e redistribui entre os não pagos.
- Walk-out alerta o gerente com o saldo em aberto.
- Reabertura de conta não estorna automaticamente o já pago (ADR-004) e grava `audit_log`.

### T-G3-09 · NOVO — Arrastar itens e item compartilhado
**Tipo** app **Tamanho** M **Depende de** T-G3-04
**Spec** §4.2 etapa 8 ("inclusive arrastando itens para cada pessoa"), §4.4 ("permitindo compartilhar um mesmo item entre várias")
**Gap** A seleção é por checkbox (`SplitBillScreen.tsx:231`) e **item compartilhado entre pessoas não é
representável** no modelo atual.
**Aceite** Um item pode ser arrastado para duas pessoas e o rateio bate com a soma total.

### T-G3-10 · AJUSTE — Taxa e gorjeta pela regra da spec
**Tipo** servidor **Tamanho** P **Depende de** T-G3-03, T-F3-01
**Spec** §4.4 ("a taxa de serviço é aplicada sobre o subtotal e a gorjeta é sugerida em percentual sobre o valor da própria parte, sempre editável"), §3.4 ("a gorjeta é atribuída ao garçom responsável pela mesa")
**Gap** Hoje a base da gorjeta é decidida no app (`TipPaymentScreen.tsx:41-43`) e a atribuição ao garçom não é garantida no fechamento.
**Aceite** Taxa sobre o subtotal, gorjeta sobre a própria parte, editável, e creditada ao garçom da mesa.

### T-G3-11 · NOVO — Escolha entre pagar sozinho e dividir
**Tipo** app **Tamanho** P
**Spec** §3.4 ("o fechamento oferece dois modos … sendo o compartilhado o padrão quando há mais de um convidado na comanda")
**Aceite** Com mais de um convidado, o modo compartilhado vem selecionado por padrão.

### T-G3-12 · NOVO — Marca pago/não pago visível a todos
**Tipo** app **Tamanho** P **Depende de** T-G3-02
**Spec** §3.4 ("cada convidado tem a marca pago / não pago"), §4.4 ("parcelas em aberto ficam visíveis para o garçom e para os demais participantes")
**Aceite** A marca aparece em tempo real para todos os participantes e para o garçom.
