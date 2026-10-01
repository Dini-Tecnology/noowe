# Fatias de implementação

## Por que o backlog não segue a ordem do documento

A spec está organizada para leitura humana: introdução → arquitetura → Fine Dining → Casual
Dining → Quick Service → comparativo. Nessa ordem, **os capítulos 3, 4 e 5 descrevem a mesma
funcionalidade três vezes** — split de conta aparece em §3.4 e §4.4, QR de mesa em §3.4 e
§4.1, fidelidade em três lugares.

Implementar capítulo a capítulo constrói o mesmo motor três vezes, com três divergências
sutis. As fatias abaixo reorganizam o mesmo conteúdo por **unidade de trabalho**: cada
funcionalidade aparece uma vez só, com as variações por modelo tratadas como configuração.

## Grafo de dependências

```
F1 Tenancy, papéis e RLS
 └─ F2 Dinheiro, auditoria, idempotência
     └─ F3 Configuração e capabilities
         ├─ N1 Cardápio, estações, disponibilidade
         │   └─ N2 Pedido, itens, máquina de estado
         │       ├─ N3 KDS e tempo real
         │       └─ N4 Pagamento e fiscal
         │           └─ Q1 Quick Service ────────────── (independe do motor de grupo)
         ├─ E1 Reservas ─────────┐
         ├─ E2 Fila virtual ─────┴─ G1 Sessão de mesa, QR e check-in
         │                            ├─ G2 Convite por link e capacidade
         │                            │   └─ G3 Divisão de conta e pagamento parcial
         │                            ├─ G2b Convite por @username com aceite
         │                            ├─ S1 Chamados e ações do garçom
         │                            ├─ C1 Casual: família, aniversário, festas
         │                            └─ D1 Fine: harmonização, sommelier, níveis
         └─ P1 Fidelidade
             └─ P2 Avaliação, CRM e relatórios
```

**A dependência menos óbvia, e a mais importante:** `G1` depende de `E1` **ou** `E2`. Uma
sessão de mesa só pode abrir com origem de entrada rastreável — reserva ou posição de fila
(ADR-008, invariante 2 do modelo de dados). Implementar o QR de mesa antes de existir qualquer
porta de entrada produz um check-in que a constraint do banco vai rejeitar.

## Índice

| # | Fatia | Modelos | Depende de |
|---|---|---|---|
| [F1](F1-tenancy-papeis-rls.md) | Tenancy, papéis e RLS | Todos | — |
| [F2](F2-dinheiro-auditoria-idempotencia.md) | Dinheiro, auditoria e idempotência | Todos | F1 |
| [F3](F3-config-capabilities.md) | Configuração e capability flags | Todos | F1, F2 |
| [N1](N1-cardapio-estacoes.md) | Cardápio, estações e disponibilidade | Todos | F3 |
| [N2](N2-pedido-maquina-de-estado.md) | Pedido, itens e máquina de estado | Todos | N1 |
| [N3](N3-kds-tempo-real.md) | KDS e tempo real | Todos | N2 |
| [N4](N4-pagamento-fiscal.md) | Pagamento e fiscal | Todos | N2, F2 |
| [E1](E1-reservas.md) | Reservas | Fine, Casual | F3 |
| [E2](E2-fila-virtual.md) | Fila virtual e consumo na espera | Fine, Casual | F3, N2 |
| [G1](G1-sessao-qr-checkin.md) | Sessão de mesa, QR e check-in | Fine, Casual | E1 ou E2 |
| [G2](G2-convite-capacidade.md) | Convite por link e capacidade | Fine, Casual | G1 |
| [G2b](G2b-convite-por-username.md) | Convite por @username com aceite (ADR-011) | Fine, Casual | G1 |
| [G3](G3-split-pagamento-parcial.md) | Divisão de conta e pagamento parcial | Fine, Casual | G2, N4 |
| [S1](S1-chamados-acoes-garcom.md) | Chamados e ações do garçom na mesa | Fine, Casual | G1 |
| [Q1](Q1-quick-service.md) | Quick Service completo | Quick | N4 |
| [C1](C1-casual-familia-festas.md) | Modo família, aniversário e festas | Casual | G1 |
| [D1](D1-fine-harmonizacao-sommelier.md) | Harmonização, sommelier e níveis | Fine | G1, S1 |
| [P1](P1-fidelidade.md) | Fidelidade (pontos, níveis, selos) | Todos | N4 |
| [P2](P2-avaliacao-crm-relatorios.md) | Avaliação, CRM e relatórios | Todos | P1 |

## Correspondência com o faseamento da spec (§8)

| Fase da spec | Fatias |
|---|---|
| Fase 1 — Base | F1, F2, F3, N1, N2, N3, N4, e o mínimo de G1 |
| Fase 2 — Diferenciação | E1, E2, G1, G2, G3, Q1, S1 |
| Fase 3 — Inteligência | C1, D1, P1, e a capacidade por janela de Q1 |
| Fase 4 — Gestão | P2 |

## O backlog executável

Estas fatias definem **escopo e critério de aceite**. O que efetivamente falta implementar, medido
contra o repositório em `bbd69c5`, está quebrado em tarefas em **[`docs/tarefas/`](../tarefas/README.md)** —
161 itens, cada um ligado a uma fatia, a uma seção da spec e à evidência do gap em `arquivo:linha`.
A leitura útil é: fatia para saber o que a spec exige, tarefa para saber o que fazer a seguir.

## Como cada fatia está escrita

- **Objetivo** — o que passa a existir ao final, em uma frase.
- **Spec** — as seções da spec que a fatia cobre. Ler antes de começar.
- **Entregáveis** — separados em banco, servidor e app, porque em Supabase a ordem importa.
- **Critérios de aceite** — copiados da spec quando existem, cada um vira um teste.
- **Fora de escopo** — o que *não* fazer aqui, para a fatia não crescer.

Fatia sem teste para cada critério de aceite listado não está pronta.
