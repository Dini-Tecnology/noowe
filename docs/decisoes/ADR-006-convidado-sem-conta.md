# ADR-006 — Convidado sem conta na NOOWE

**Status:** ACEITO (2026-09-14) — aprovado explicitamente pelo responsável do produto
**Origem:** spec §8.1, sexta decisão em aberto
**Impacta:** Fatia G2 (convite por link), Fatia G3 (split)

## Questão

A spec §2.6 diz que o convidado "autentica (ou entra como visitante com nome)". Mas §2.6 também
afirma que "convidado que sai antes do pagamento continua responsável pelos itens atribuídos a
ele". Um visitante anônimo não pode ser responsabilizado por nada — a regra e o mecanismo se
contradizem.

## Decisão proposta

**Convidado pode entrar e pedir apenas com nome, mas a responsabilidade de pagamento é sempre
do anfitrião.**

1. `session_participants` aceita `user_id = NULL` com `display_name` preenchido.
2. Um participante sem conta pode montar comanda e ter itens atribuídos.
3. Um participante sem conta **não pode fechar a própria parte pelo app** — paga presencialmente
   ao garçom, ou sua parte é assumida por outro participante.
4. Todo saldo de participante anônimo não quitado no fechamento **recai sobre o anfitrião**, que
   tem conta e é identificável. Isso é exibido ao anfitrião no momento de gerar o convite,
   em texto claro, não em letra miúda.
5. Flag `require_guest_account` (default `false`) permite ao estabelecimento exigir cadastro
   mínimo com telefone verificado — recomendado para Fine Dining com ticket alto.

## Por quê

Exigir cadastro de todo convidado mata a proposta do convite por link: o atrito de cadastro na
mesa, com o prato chegando, é exatamente o que o link existe para evitar. Mas deixar consumo
anônimo sem âncora de responsabilidade transfere o risco para o restaurante sem que ninguém
tenha decidido isso.

Ancorar no anfitrião resolve os dois: entrada sem atrito para o convidado, responsabilidade
identificada para a casa. É também o que já acontece socialmente numa mesa — quem convida
responde pela mesa.

## Consequências

- A tela de geração do convite precisa dizer ao anfitrião, antes de ele compartilhar, que ele
  responde pelo saldo não pago dos convidados.
- `table_sessions.host_participant_id` não pode ser nulo nem apontar para participante anônimo.
- O anfitrião não pode sair da sessão enquanto houver saldo em aberto de anônimos.
