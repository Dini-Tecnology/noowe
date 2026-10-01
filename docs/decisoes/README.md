# Decisões de arquitetura (ADRs)

As oito decisões que a spec (§8.1) deixou em aberto, mais duas que o plano de aderência precisou
registrar (009 e 010) e uma adição de produto à spec (011).

> **Estado em 14/09/2026: nove aceitas, uma provisória.** O ADR-006 e o ADR-010 foram escolhidos
> explicitamente pelo responsável do produto. Os ADRs 001, 002, 003, 005, 007 e 008 foram aceitos
> com o default proposto, por delegação à recomendação técnica. O ADR-009 registra a escolha já
> aplicada na migration de congelamento. **O ADR-004 continua `PROVISÓRIO`** e precisa de revisão
> humana antes da Onda 3. Cada regra segue isolada numa função nomeada, para que uma revisão
> posterior seja pontual.

| ADR | Decisão | Status | Risco se ignorada |
|---|---|---|---|
| [001](ADR-001-arredondamento-split-igual.md) | Centavos residuais distribuídos por `joined_at` | Aceito | Conta que não fecha; centavo criado ou perdido |
| [002](ADR-002-tolerancias-fila-e-no-show.md) | 8 min fila / 15 min no-show, separados | Aceito, recalibrar em operação | Cada tela com seu próprio timer |
| [003](ADR-003-coexistencia-de-modelos.md) | Ponto de entrada determina o modelo | Aceito | Pedido quick com sessão de mesa aberta |
| [004](ADR-004-reversao-de-pagamento-parcial.md) | Sem estorno automático na reabertura | **Provisório** | **Vetor de fraude e descasamento fiscal** |
| [005](ADR-005-credito-de-fidelidade.md) | Pontos por parcela paga, selo na retirada | Aceito | Pontos sem dono no split |
| [006](ADR-006-convidado-sem-conta.md) | Anônimo consome; anfitrião responde | Aceito | **Saldo sem responsável** |
| [007](ADR-007-excecao-de-lotacao.md) | `seat_count` por participante, aprovação sempre | Aceito | Mesa lotada em silêncio |
| [008](ADR-008-fine-dining-sem-reserva.md) | Política com janela; origem da sessão é a trava | Aceito | Consumo sem registro de entrada |
| [009](ADR-009-fila-virtual-waitlist-entries.md) | `waitlist_entries` é a fila; `queue_entries` fica congelada | Aceito | Duas filas divergindo |
| [010](ADR-010-regras-de-fechamento-por-unidade.md) | Valor fixo e destino da gorjeta viram política da unidade | Aceito | Fine ou Casual fora da spec |
| [011](ADR-011-convite-por-username.md) | Convite por @username com aceite, convivendo com link e QR | Aceito | Convidado entra sem consentir; mesa lota em silêncio |
| [012](ADR-012-preco-medio-e-horario-com-turnos.md) | Preço médio do cardápio no lugar de "por pessoa"; horário com turnos em `opening_hours`; check-in exige restaurante aberto | Aceito | Cliente vê "Fechado" com o restaurante aberto; mesa aberta fora do horário |

**Vocabulário:** os ADRs usam os nomes da spec. A tradução para o banco está em
[`docs/arquitetura/05-glossario-spec-banco.md`](../arquitetura/05-glossario-spec-banco.md).

**Pendente de revisão humana:** ADR-004. Envolve estorno, documento fiscal já emitido e fraude por
reabertura de conta.
