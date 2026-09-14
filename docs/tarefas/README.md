# Backlog de implementação — spec v2

**Origem:** `docs/spec/NOOWE-spec-v2.md` (idêntico ao `.docx` v2.0 de setembro de 2026)
**Base factual:** `docs/RECONCILIACAO-RESULTADO.md`, reverificada em 2026-09-08 no HEAD `bbd69c5` e conferida contra o banco vivo em 2026-09-14
**Unidades de escopo:** `docs/fatias/` — cada tarefa aqui pertence a uma fatia e não a substitui

> As fatias dizem **o que a spec exige**. A reconciliação diz **o que o repositório tem**.
> Este backlog é a diferença entre os dois, quebrada em trabalho executável.

---

## Como ler uma tarefa

```
### T-F2-01 · Título
**Tipo** banco | servidor | app | teste | decisão   **Tamanho** P | M | G
**Spec** seção da spec que origina a exigência
**Invariante** número em CLAUDE.md, quando aplicável
**Gap** o que existe hoje, com arquivo:linha
**Fazer** os passos
**Aceite** o que precisa ser verdade — cada linha vira um teste
```

Tamanhos são ordem de grandeza, não estimativa: **P** ≤ 1 dia · **M** 2–4 dias · **G** ≥ 1 semana.
`AJUSTE` no título significa que existe código funcionando que precisa mudar — não é campo novo.
`NOVO` significa que não existe substrato nenhum.

---

## A ordem não é negociável

O grafo de `docs/fatias/README.md` já dizia que F1 → F2 → F3 vêm antes de tudo. A reconciliação
explica por quê no caso concreto deste repositório: as três fundações estão **DIVERGENTES**, e
divergência de fundação não se acrescenta depois sem migração de dados.

Especificamente:

- **T-F2-01** (dinheiro em centavos) toca 105 colunas e todo o app. Cada tarefa de N4, G3, Q1 e
  P1 escrita antes dela terá de ser reescrita depois.
- **T-F2-03/04** (auditoria) é pré-requisito de sete critérios de aceite espalhados por G2, G3,
  C1, N2 e P2. Hoje `audit_logs` existe e recebe **zero** `insert`.
- **T-G1-01** (origem de entrada da sessão) é a dependência estrutural do grafo: sem
  `reservation_id`/`queue_entry_id` em `table_sessions`, todo o motor de grupo abre sessão sem
  procedência rastreável.

---

## Sumário por bloco

| Bloco | Fatias | Tarefas | Estado na reconciliação |
|---|---|---:|---|
| [T0 — Fundações](T0-fundacoes.md) | F1, F2, F3 | 22 | DIVERGENTE nas três |
| [T1 — Núcleo](T1-nucleo.md) | N1, N2, N3, N4 | 22 | PARCIAL / DIVERGENTE |
| [T2 — Entrada e grupo](T2-entrada-e-grupo.md) | E1, E2, G1, G2, G3 | 44 | PARCIAL / DIVERGENTE |
| [T3 — Modelos de serviço](T3-modelos-de-servico.md) | Q1, C1, D1, S1 | 34 | Q1 AUSENTE no backend |
| [T4 — Fidelidade e gestão](T4-fidelidade-gestao.md) | P1, P2 | 16 | DIVERGENTE / PARCIAL |
| [T5 — Decisões e transversais](T5-decisoes-transversais.md) | — | 23 | fora das 18 fatias |
| **Total** | | **161** | |

## Correspondência com o faseamento da spec (§8)

| Fase da spec | Tarefas |
|---|---|
| Fase 1 — Base | todo o T0, T1 inteiro, T-G1-01 a T-G1-04 |
| Fase 2 — Diferenciação | T2 (E1, E2, G1, G2, G3), Q1 e S1 do T3 |
| Fase 3 — Inteligência | C1 e D1 do T3, T4 (P1), capacidade por janela de Q1 |
| Fase 4 — Gestão | T4 (P2), relatórios e custo |

---

## Decisões de fundação — estado em 2026-09-14

- **T-X-01 decidido:** o banco mantém o próprio vocabulário; tradução em `docs/arquitetura/05-glossario-spec-banco.md`.
- **T-X-02 decidido em parte:** nove ADRs aceitos; **o ADR-004 continua provisório** e bloqueia T-G3-08.
- **T-X-03 decidido em parte:** fila, chamado, comanda em grupo e parcelas estão resolvidos pelo congelamento
  (ADR-009); configuração e fidelidade se resolvem em T-F3-01 e T-P1-01.
- **Onda 0 quase fechada:** congelamento e reconciliação aplicados em produção em 14/09 e verificados (T-X-20); as
  três varreduras SQL passam contra produção. Faltam T-X-19 (versionar), T-F2-08 (suíte rodando no CI) e o lock de
  T-X-17.

## Definição de pronto

Igual à das fatias, sem exceção: **fatia sem teste para cada critério de aceite listado não está
pronta.** Hoje nenhum critério de aceite de nenhuma fatia tem teste correspondente, e a suíte SQL
ainda não roda no CI — por isso **T-F2-08** (suíte SQL) e **T-X-17** (testes do app do cliente) aparecem cedo no backlog.
