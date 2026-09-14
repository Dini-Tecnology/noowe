# ADR-008 — Fine Dining operando sem reserva obrigatória

**Status:** ACEITO (2026-09-14) — default mantido; escolha delegada pelo responsável do produto à recomendação técnica do plano de aderência
**Origem:** spec §8.1, oitava decisão em aberto
**Impacta:** Fatia F3 (config), Fatia E1 (reservas), Fatia E2 (fila)
**Vocabulário:** no banco, `queue_entry_id` é `waitlist_entry_id` (ADR-009, `docs/arquitetura/05-glossario-spec-banco.md`)

## Questão

A spec §3.1 é categórica: "Não existe consumo sem reserva ou posição de fila registrada". §8.1
pergunta se a casa pode desligar a obrigatoriedade em dias específicos.

## Decisão proposta

**Sim, mas `reservation_required` é uma política com janela, não um booleano global — e
desligá-la nunca libera consumo anônimo.**

1. `reservation_policy` é uma lista de regras com dia da semana, faixa de datas e horário. Fora
   das janelas cobertas, vale o default da unidade.
2. Quando a reserva não é obrigatória numa janela, **a fila virtual passa a ser obrigatória**.
   Não existe estado em que ambas estejam desligadas e a mesa aceite cliente.
3. A trava real não é "tem reserva": é `table_sessions` só abrir com uma origem válida
   (`reservation_id` **ou** `queue_entry_id`). Essa constraint fica no banco e vale sempre,
   independentemente da configuração.

## Por quê

A regra que importa em Fine Dining não é "reserva obrigatória" — é **entrada controlada e
rastreável**. Reserva e fila são duas formas de registrar a mesma coisa. Modelar a trava sobre
a origem da sessão, e não sobre a existência de reserva, deixa a configuração livre sem abrir
buraco: mudar a flag muda por onde o cliente entra, nunca se ele pode entrar sem registro.

Janela em vez de booleano porque o caso de uso real é sazonal (feriado, evento, segunda-feira
de baixa), e um booleano global obriga alguém a lembrar de religar — o que ninguém faz.

## Consequências

- Constraint no banco: `table_sessions` exige `reservation_id IS NOT NULL OR queue_entry_id IS
  NOT NULL`. Este é o critério de aceite da spec §3.6 traduzido em invariante de dados, e vale
  para Fine e Casual.
- A tela de configuração precisa impedir salvar reserva e fila ambas desligadas num modelo de
  sala. Erro de validação, não aviso.
