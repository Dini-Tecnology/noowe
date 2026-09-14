# G1 — Sessão de mesa, QR e check-in

**Objetivo:** o QR da mesa abre uma e só uma sessão, ancorada numa entrada rastreável.
**Depende de:** E1 **ou** E2 — ver aviso abaixo
**Spec:** §2.6, §3.4 ("QR e associação de mesa"), §4.1
**ADRs:** 003 (tipo de QR), 007 (assentos), 008 (origem da sessão)

> **Atenção à ordem.** A constraint `session_needs_entry_origin` exige `reservation_id` ou
> `queue_entry_id`. Implementar esta fatia antes de E1/E2 produz um check-in que o banco
> rejeita. Faça pelo menos uma das duas portas de entrada primeiro.

## Entregáveis

**Banco**
- `table_sessions` e `session_participants` conforme `01-modelo-de-dados.md`
- **Índice único parcial:** uma sessão aberta por mesa
- Constraint de origem de entrada
- `qr_codes` com tipo `table` | `counter` (ADR-003)

**Servidor**
- RPC `check_in(qr_token, party_size)` — valida capacidade, abre sessão, define anfitrião
- Evento `session.opened`: mesa vai para `occupied`, garçom recebe a mesa no painel

**App**
- Tela de câmera única que resolve os dois tipos de QR para fluxos diferentes
- Se a mesa já está em `billing`, o QR abre **o fechamento de conta**, não o cardápio
  (spec §3.4)

## Critérios de aceite

1. Ler o QR da mesa associa o cliente à mesa correta e abre a comanda em **menos de 3 segundos**
   (spec §3.6).
2. Dois clientes lendo o mesmo QR entram na **mesma** sessão; nunca é criada uma segunda
   comanda para a mesma mesa (spec §2.6, §3.4).
3. Tentar abrir sessão sem reserva nem posição de fila é rejeitado pelo banco (ADR-008).
4. Mesa em `billing` faz o QR abrir o fechamento (spec §3.4).
5. Check-in muda a mesa para `occupied` e o garçom responsável recebe a mesa no painel.
6. Concorrência: duas leituras simultâneas do mesmo QR não criam duas sessões — teste com duas
   transações em paralelo.

## Fora de escopo

Convite por link e exceção de lotação (G2). Split (G3).
