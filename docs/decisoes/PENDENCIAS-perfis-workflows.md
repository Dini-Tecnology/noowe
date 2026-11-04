# Pendências para o autor do documento de perfis e workflows

Enviar a @Pedro. Cada linha tem um default **provisório** já isolado em função nomeada; trocar depois é mudança pontual.
Os itens em **negrito** bloqueiam a fatia indicada: não implementar antes da resposta.

**Atualizado em 03/11/2026** com as respostas registradas em [`aditivo-comercial-e-pagamentos`](../spec/aditivo-comercial-e-pagamentos.md), inclusive a segunda rodada (10, 11 e 17–32).
Os itens 2–7 e 12–15 não tiveram objeção: seguem com o default.

| # | Ponto | Conflito | Default provisório | ADR | Bloqueia |
|---|---|---|---|---|---|
| 1 | Limite de quebra de caixa e política de no-show | **Mudou:** o aditivo (item G) põe "parâmetros do caixa" com Dono e Gerente. Ver item 19 | Ver item 19 | 029 | — |
| 2 | Conferência no Quick | ADR-013 e Q1 #3/#9 a tornam obrigatória; o PDF faz da Expedição uma opção | Vale a opção Expedição | 028 | — |
| 3 | Fine sem interruptor de reserva | ADR-008 admite janelas sem reserva, com fila | Vale o documento; a trava de origem da sessão permanece | 027 | — |
| 4 | Cliente escolhe "Experiência Fine" ou "Reserva comum" | ADR-003: o cliente nunca escolhe o modelo | Escolha só na reserva; o QR segue a regra do Casual | 027 | — |
| 5 | Balcão "substitui Ao Vivo" no Garçom | Em Casual + Quick o garçom perderia as tarefas de mesa | Substitui só sem serviço de mesa; senão, aba extra | 025 | — |
| 6 | Gerente recebe "toda tarefa" | Em noite cheia, centenas de pushes | Tudo na tela; push só para aprovações, atrasos e tarefa sem responsável | 022 | — |
| 7 | Ninguém escalado no turno | "Sem subida de nível" não cobre turno sem Gerente ou sem garçom | Sem Gerente em turno: todos os gerentes ativos e o Dono | 022 | — |
| 8 | ~~Taxa de serviço ou gorjeta, sempre opcional~~ | **Respondido** (itens 1 e A do aditivo) | — | 032 | — |
| 9 | ~~Retenção e rateio~~ | **Respondido** (item 2): o app oferece, o contador valida | — | 029 | — |
| 10 | ~~Taxa de no-show e pré-autorização~~ | **Respondido:** ocultas na primeira versão. Quando existirem, só com aceite explícito e reserva de valor no gateway | — | 029 | — |
| 11a | ~~Reabertura de comanda~~ | **Respondido** (item 3) | — | 004 | — |
| 11b | ~~Tap to Pay~~ | **Respondido:** fornecedor em negociação; mecanismo pronto e tela oculta até ativar (fatia T1) | — | 029 | — |
| 12 | Cozinheiro com "só o botão Pronto" | O PDF também prevê pedir ajuda e solicitar indisponível | Pronto no card; os outros dois num menu secundário | 024 | — |
| 13 | QR com fila ativa | ADR-016 item 4 manda ao Maître; o documento fala só em mesa reservada | Mantém o item 4 enquanto a mesa estiver segurada | 026 | — |
| 14 | Etapas do Quick mostradas ao cliente | ADR-013 e PDF usam nomes diferentes | Mantém as do ADR-013 | 024 | — |
| 15 | Receita do dia | A avaliação não define; a validação no app mostrou pedido entregue e não pago somando na receita | Receita é o que foi pago: pagamento confirmado ou pedido concluído (`private.counts_as_revenue`) | 024 | — |
| 16 | ~~Por item depois de outra divisão~~ | **Respondido** (itens 4 e A): só recusa com saldo zero | — | 032 | — |

## Respostas da segunda rodada (03/11/2026)

Texto íntegro no [aditivo](../spec/aditivo-comercial-e-pagamentos.md), seção "Respostas às pendências".

| # | Ponto | Decisão | Vai para |
|---|---|---|---|
| 17 | Valor fixo inclui a taxa | É o total que sai do cartão, dividido e mostrado antes de confirmar. Sem taxa, é só consumo. Gorjeta livre entra por cima, à parte | G5 |
| 18 | Partes iguais com taxa retirada | Consumo igual; a taxa é de cada um | G5 |
| 19 | Limite de quebra | Só o Dono. Fundo de troco e limite para sugerir sangria: Dono e Gerente | O8 |
| 20 | Maître que cobra | Vê consumo, saldo e quem pagou na mesa que está cobrando; não vê caixa, outras mesas em detalhe nem taxas | O8 |
| 21 | Estorno | **Mudou o default.** Total no mesmo dia operacional: devolve a taxa, e a NOOWE assume a tarifa. Depois do dia ou parcial: não devolve. Contestação: não devolve, e a tarifa de contestação fica com o restaurante | M2 |
| 22 | Compensação | Separada dos créditos, sem limite nem validade, em linha própria da fatura, e o que sobra segue para as próximas | M2, M4 |
| 23 | Tap no Profissional | Fora da lista até ativar o fornecedor | M1, T1 |
| 24 | Business e Enterprise | Business: 8.000 pedidos, com NFC-e na mesma franquia. Enterprise: "Sob consulta", com preço por contrato nos parâmetros do restaurante | M1, M4 |
| 25 | O que é pedido | Cada envio à cozinha ou ao bar. Espera da fila e Quick contam 1 cada. Cancelado não conta | M4 |
| 26 | Restaurantes atuais | **Mudou o default.** Um fluxo só: escolhem o plano no próximo acesso do Dono, com 30 dias de teste, ou código de fundador sem teste | M1, M4, M6 |
| 27 | Dia operacional | De um fechamento do dia ao seguinte. Sem caixa aberto, vira em horário configurável (6h), com alerta e sem fechar sozinho | O8 |
| 28 | Nota da NOOWE | Dados da empresa nos parâmetros; fatura com NFS-e pelo Asaas. Conveniência em R$ 0 e desligada até o contador confirmar | M1, M3, M4 |
| 29 | Gerente deduz a taxa | Mantém o default; não foi à resposta porque não muda o que se constrói | — |
| 30 | Cliente cancela | **Mudou o default.** Cancela pelo app enquanto o item não foi à estação; depois, só com aprovação. Quick: estorno integral e automático antes da estação | O7 |
| 31 | Conta pedida | QR funciona com a comanda aberta, em qualquer estado. Os estados são só informativos | O4 |
| 32 | Dono e aprovação | **Mudou o default.** O Dono nunca precisa de aprovação: aplica direto, com registro. A regra de não aprovar o próprio pedido vale para os demais | O2 (ajuste) |

## Perguntas abertas pelas respostas

| # | Ponto | Por que importa | Default provisório | Bloqueia |
|---|---|---|---|---|
| 33 | **"Comanda aberta (saldo maior que zero)" no QR** | Mesa recém-aberta, sem nenhum pedido, tem saldo zero. Ao pé da letra, o amigo que chega antes do primeiro pedido não entraria | Vale a sessão ativa, com qualquer saldo. Só deixa de valer ao encerrar a comanda | O4 |
| 34 | **Dados da empresa NOOWE** | Só veio o CNPJ. Faltam razão social, endereço, inscrição municipal e regime tributário para preencher a tabela | Campos ficam vazios, e nenhuma nota é emitida sem eles | **M3/M4** (emissão) |
| 35 | **Restaurante ativo que não escolhe plano** | A etapa aparece no próximo acesso do Dono, mas a resposta não diz o que acontece se ele não escolher, nem quando os 30 dias começam | Os 30 dias contam desde esse acesso; a operação segue, e ao fim do teste valem os prazos de atraso, sem bloquear comanda aberta | **M4** |
| 36 | **"Dinheiro" como forma da maquininha** | A resposta 11 põe dinheiro em "pagamento externo", mas dinheiro entra na gaveta e precisa contar no fechamento cego | Dinheiro entra como dinheiro no caixa; crédito, débito, Pix e vale como externo | O8, T1 |
| 37 | **Credenciais do Tap na tabela de parâmetros** | A resposta 11 pede credenciais na tabela. Segredo em tabela aparece em histórico, cópia de banco e consultas | O fornecedor ativo fica na tabela; as credenciais, em segredo (Vault ou segredo da função), como as do Asaas | T1 |
| 38 | **Confirmações do contador da NOOWE** | Formato e emissor da nota de conveniência, e passagem do valor pela conta do restaurante | Aguardando. Não trava a construção: a taxa fica em R$ 0 e desligada | Ligar a M3 |
| 39 | **Restaurante novo com perfil incompleto** | Natural Noowe e Parrilaria Noowe, criados depois do backfill de setembro, estão ativos sem preço médio (o primeiro também sem comodidades). A tela de detalhes assume perfil completo | Etapa de cadastro da M4 exige os campos; os dois existentes ficam como estão, porque são de teste | M4 |
| 40 | **Recepcionista recusa reserva?** | O PDF diz que ela não pode "aprovar, recusar" | Não recusa; só o Maître completo, Gerente e Dono | — |
| 41 | **O que é "isentar no-show" sem taxa?** | A taxa está oculta (resposta 10) e não há o que isentar | Reverter o no-show; quando a taxa existir, a permissão é a mesma | — |
| 42 | **Gerente altera outro Gerente?** | Item G só diz que o Dono "concede" | Só o Dono altera ou inativa Gerente | — |
| 43 | **Validade do convite de equipe** | Não definida | 7 dias, em `noowe_billing_settings.staff_invite_days` | — |
| 44 | **Convite sem e-mail** | "Por e-mail ou link": o link funciona para quem o tiver | Permitido; quem convida escolhe | — |
| 45 | **Quem vê a escala** | A matriz do PDF inclui Maître e Chef, e hoje só Dono e Gerente leem | Fica para depois: não está nos critérios da O3 | — |
| 46 | **Prazo da reserva do Pix** | O aditivo fala em 10 minutos e o Quick usa 15 (ADR-013) | 10 no salão, 15 no Quick. `pix_expiry_min`, por serviço | — |
| 47 | **Fechar a conta manualmente** | O saldo só zera pagando, mas o gerente já tinha fechamento manual | Continua, como exceção auditada, com motivo | — |
| 48 | **Quem sai sem pagar** | "A parte fica para o titular": falta dizer como se sai | Convidado sai confirmando; a parte fica com o titular, que é avisado | — |
| 49 | **O próprio titular sai?** | O aditivo não trata | Não sai com saldo. Walk-out do titular mantém o saldo e alerta o gerente | — |
| 50 | **Restaurantes que já usam taxa** | O padrão sugerido põe Casual em gorjeta; trocar sozinho mudaria o que eles recebem | Quem tem taxa fica com taxa; só restaurante novo nasce com o padrão | — |
| 51 | **Reserva do cartão** | A página do cartão não tem prazo próprio | 15 minutos, em `card_hold_min` | — |
| 52 | **Retirada da taxa e nova divisão** | Se outra pessoa refaz a divisão, a retirada se perderia | A retirada acompanha a pessoa até ela pagar | — |
| 53 | **Motivo da retirada** | "Grava autor, motivo e horário", mas o cliente tem só um toque | Cliente: "A pedido do cliente". Garçom: pode escrever o motivo | — |
| 54 | **Partes iguais com número ajustado** | "Número ajustado" pode ser gente sem o app | Quem confirma paga a própria parte, e o resto segue no saldo | — |
| 55 | **Teto da gorjeta** | Não definido; já existia teto de 100% do valor | Mantido | — |
| 56 | **Pagamento presencial sem participante** | Mesa aberta pela equipe não tem participante | A parcela fica sem participante, e aparece como "Pago no salão" | — |
| 57 | **Divisa com a O8** | Dinheiro em caixa e rateio são da O8 | G5 abate o saldo e desmarca a taxa. Gaveta, fechamento cego e rateio ficam na O8 | — |
