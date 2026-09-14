# D1 — Fine: harmonização, sommelier e fidelidade por níveis

**Objetivo:** os módulos que só Fine Dining ativa, sobre tudo que já existe.
**Depende de:** G1, S1
**Spec:** §3.1, §3.2 (etapas 4 e 12), §3.4 (fidelidade), §8 (Fase 3)

> Fine Dining é o **superconjunto**: quase tudo dele já foi entregue nas fatias comuns. Esta
> fatia é curta de propósito. Se ela estiver crescendo, algo que deveria ser comum está sendo
> reimplementado aqui.

## Entregáveis

- **Harmonização sugerida** na tela de item e de cardápio (spec §3.2 etapa 4)
- **Chamado de sommelier** como tipo de `service_call` (a infraestrutura é S1; aqui é a
  capability e a tela)
- **Fidelidade por níveis:** tiers progressivos sobre o motor de pontos de P1
- Menus especiais e aprovações do chef antes do serviço (spec §3.3)
- Status por item com **identificação do responsável pelo preparo** — em Fine é requisito, não
  enfeite (spec §3.2 etapa 6)

## Critérios de aceite

1. A harmonização sugerida respeita a disponibilidade real do item sugerido.
2. O chamado de sommelier chega à tela do **garçom responsável** pela mesa, com o tipo sommelier e a mesa
   identificados (spec §3.6 e §3.2 etapa 12; o §2.4 não tem papel de sommelier). *Corrigido em 2026-09-14 — a
   versão anterior mandava o chamado para um papel próprio.*
3. Os níveis de fidelidade são configuráveis por estabelecimento, não fixos em código.
4. Nenhuma funcionalidade comum (QR, convite, split, chamados) foi reimplementada nesta fatia —
   verificação por revisão de diff, não por teste.

## Fora de escopo

Tudo que Fine compartilha com Casual, que é quase tudo.
