# Como usar este pacote com o Claude Code

## O que é isto

A especificação NOOWE v2.0 reorganizada para ser executada por um agente de código, em vez de
lida por uma pessoa. O documento original está íntegro em `spec/NOOWE-spec-v2.md` — nada foi
substituído, apenas indexado, decidido e recortado.

## Instalação

Copie para a raiz do repositório do app:

```
CLAUDE.md                    ← entra em contexto em toda sessão
docs/
  00-COMO-USAR.md            ← este arquivo
  01-RECONCILIACAO.md        ← faça isto primeiro
  spec/                      ← fonte da verdade, íntegra
  arquitetura/               ← esquema, RLS, config, cálculo financeiro
  decisoes/                  ← ADR-001 a 008
  fatias/                    ← as unidades de escopo, com critérios de aceite
  tarefas/                   ← o backlog executável, derivado da reconciliação
```

Commite tudo. O valor de `CLAUDE.md` é estar versionado junto do código que ele governa.

## A ordem que importa

**1. Reconciliação, antes de qualquer implementação.**
Existe um MVP parcial. Rode o procedimento de `01-RECONCILIACAO.md` para descobrir o que já
existe, o que existe mas diverge da spec, e o que não existe. Sem isso, a primeira fatia vai
reescrever código que funciona.

**2. Revisar os ADRs.**
As oito decisões em aberto da spec §8.1 têm defaults propostos, todos marcados `PROVISÓRIO`.
Leia `decisoes/README.md` — leva dez minutos e evita retrabalho. **ADR-004 e ADR-006 envolvem
dinheiro e responsabilidade legal**; se você só tiver tempo para dois, leia esses.

**3. Fatias e tarefas, na ordem do grafo.**
`fatias/README.md` tem o grafo de dependências. A dependência menos óbvia: `G1` (sessão de
mesa) precisa de `E1` ou `E2` (reserva ou fila) antes, porque a constraint do banco exige
origem de entrada rastreável.
`tarefas/README.md` traduz a reconciliação em 145 tarefas executáveis dentro dessa mesma ordem,
cada uma ligada a uma fatia, a uma seção da spec e à evidência do gap em `arquivo:linha`. É o
que se pega para trabalhar; a fatia continua sendo a definição de escopo e de pronto.

## Como conversar com o Claude Code

Uma fatia por sessão. O prompt é curto porque o contexto já está nos arquivos:

```
Implemente a fatia G2 (docs/fatias/G2-convite-capacidade.md).

Antes de escrever código:
1. Leia a fatia, os ADRs que ela cita e docs/arquitetura/01-modelo-de-dados.md
2. Verifique o que já existe no repositório para essa fatia
3. Me diga o que vai fazer e o que já está pronto — não implemente ainda

Depois da minha confirmação, implemente com um teste para cada critério de aceite.
```

O passo 3 é o que evita a maior fonte de retrabalho: o agente reescrevendo o que já funciona.

## Regras que valem para toda sessão

- **Uma fatia por vez.** Fatia bloqueada não começa.
- **Critério de aceite vira teste.** Sem teste do critério, a fatia não está pronta.
- **Divergência da spec é decisão humana.** Se o código contradiz a spec, pare e pergunte; não
  escolha em silêncio.
- **Não deixe `CLAUDE.md` crescer.** Ele é a lista de invariantes, não um resumo do projeto. Se
  algo cabe em `docs/`, vai para `docs/`.

## Quando a spec mudar

`spec/NOOWE-spec-v2.md` é a fonte da verdade. Se ela for atualizada:

1. Atualize o arquivo e versione (v2.1, v3.0…).
2. Verifique quais fatias citam as seções alteradas — cada fatia lista as suas.
3. Se a mudança contradiz um ADR, atualize o ADR; não deixe os dois convivendo.

A pior falha possível neste pacote é a spec e as fatias divergirem sem ninguém perceber. Por
isso as fatias **referenciam** a spec por seção em vez de copiar o texto dela.
