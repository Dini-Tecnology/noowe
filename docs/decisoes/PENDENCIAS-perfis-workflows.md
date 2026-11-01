# Pendências para o autor do documento de perfis e workflows

Enviar a @Pedro. Cada linha tem um default **provisório** já isolado em função nomeada; trocar depois é mudança pontual.
Os itens em **negrito** bloqueiam a fatia indicada: não implementar antes da resposta.

| # | Ponto | Conflito | Default provisório | ADR | Bloqueia |
|---|---|---|---|---|---|
| 1 | Limite de quebra de caixa e política de no-show | PDF p.20 diz só Dono; p.30 e a mensagem dizem que o Gerente configura tudo | Só o Dono; o Gerente fecha o caixa e não define o próprio limite | 029 | — |
| 2 | Conferência no Quick | ADR-013 e Q1 #3/#9 a tornam obrigatória; o PDF faz da Expedição uma opção | Vale a opção Expedição | 028 | — |
| 3 | Fine sem interruptor de reserva | ADR-008 admite janelas sem reserva, com fila | Vale o documento; a trava de origem da sessão permanece | 027 | — |
| 4 | Cliente escolhe "Experiência Fine" ou "Reserva comum" | ADR-003: o cliente nunca escolhe o modelo | Escolha só na reserva; o QR segue a regra do Casual | 027 | — |
| 5 | Balcão "substitui Ao Vivo" no Garçom | Em Casual + Quick o garçom perderia as tarefas de mesa | Substitui só sem serviço de mesa; senão, aba extra | 025 | — |
| 6 | Gerente recebe "toda tarefa" | Em noite cheia, centenas de pushes | Tudo na tela; push só para aprovações, atrasos e tarefa sem responsável | 022 | — |
| 7 | Ninguém escalado no turno | "Sem subida de nível" não cobre turno sem Gerente ou sem garçom | Sem Gerente em turno: todos os gerentes ativos e o Dono | 022 | — |
| 8 | **Taxa de serviço ou gorjeta, sempre opcional** | `04-calculo-financeiro` e ADR-010 põem a taxa dentro do total; muda o teste de propriedade (ADR-001) | Nenhum; o cálculo atual permanece | 029 | **O8** |
| 9 | **Retenção (20% Simples / 33%) e rateio** | Substitui `tip_allocation`; o limite legal precisa de validação contábil | Nenhum | 029 | **O8** |
| 10 | **Taxa de no-show e pré-autorização de cartão** | O adapter do Asaas não tem autorização e captura; cobrar sem consentimento é risco | Opções ocultas na Central | 029 | **O6/O9** |
| 11 | **Tap to Pay e reabertura de comanda** | A tela não cobra de verdade e exige provedor; ADR-004 segue provisório | Nenhum | 004, 029 | **O8** |
| 12 | Cozinheiro com "só o botão Pronto" | O PDF também prevê pedir ajuda e solicitar indisponível | Pronto no card; os outros dois num menu secundário | 024 | — |
| 13 | QR com fila ativa | ADR-016 item 4 manda ao Maître; o documento fala só em mesa reservada | Mantém o item 4 enquanto a mesa estiver segurada | 026 | — |
| 14 | Etapas do Quick mostradas ao cliente | ADR-013 e PDF usam nomes diferentes | Mantém as do ADR-013 | 024 | — |
