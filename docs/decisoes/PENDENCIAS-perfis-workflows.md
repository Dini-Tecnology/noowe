# Pendências para o autor do documento de perfis e workflows

Enviar a @Pedro. Cada linha tem um default **provisório** já isolado em função nomeada; trocar depois é mudança pontual.
Os itens em **negrito** bloqueiam a fatia indicada: não implementar antes da resposta.

**Atualizado em 03/11/2026** com a resposta registrada em [`aditivo-comercial-e-pagamentos`](../spec/aditivo-comercial-e-pagamentos.md).
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
| 10 | **Taxa de no-show e pré-autorização de cartão** | **Sem resposta.** O adapter do Asaas não tem autorização e captura; cobrar sem consentimento é risco | Opções ocultas na Central | 029 | **O6/O9** |
| 11a | ~~Reabertura de comanda~~ | **Respondido** (item 3) | — | 004 | — |
| 11b | **Tap to Pay** | **Em negociação.** A tela hoje registra pago sem cobrar por aproximação, e o plano Profissional vende Tap to Pay. Ver item 23 | Nenhum | 029 | **O8** |
| 12 | Cozinheiro com "só o botão Pronto" | O PDF também prevê pedir ajuda e solicitar indisponível | Pronto no card; os outros dois num menu secundário | 024 | — |
| 13 | QR com fila ativa | ADR-016 item 4 manda ao Maître; o documento fala só em mesa reservada | Mantém o item 4 enquanto a mesa estiver segurada | 026 | — |
| 14 | Etapas do Quick mostradas ao cliente | ADR-013 e PDF usam nomes diferentes | Mantém as do ADR-013 | 024 | — |
| 15 | Receita do dia | A avaliação não define; a validação no app mostrou pedido entregue e não pago somando na receita | Receita é o que foi pago: pagamento confirmado ou pedido concluído (`private.counts_as_revenue`) | 024 | — |
| 16 | ~~Por item depois de outra divisão~~ | **Respondido** (itens 4 e A): só recusa com saldo zero | — | 032 | — |

## Perguntas novas, abertas pelo aditivo

| # | Ponto | Por que importa | Default provisório | Bloqueia |
|---|---|---|---|---|
| 17 | **Valor fixo inclui a taxa?** | "Pago R$ 50": são R$ 50 de consumo mais taxa (R$ 55 cobrados) ou R$ 50 no total? A regra A6 calcula sobre o consumo, mas o A diz "qualquer valor até o saldo" | R$ 50 é o que sai do cartão; o consumo abatido é o valor sem a taxa | **G5** |
| 18 | **Partes iguais com taxa retirada** | Se 1 de 3 retira a taxa, as partes de consumo seguem iguais e só o valor final dele muda? | Sim: a parte é de consumo; a taxa é de cada um | **G5** |
| 19 | **Gerente define o próprio limite de quebra?** | Item G dá "parâmetros do caixa" a Dono e Gerente, e o Gerente é quem fecha o caixa. Quebra acima do limite vai ao Dono, mas ele pode subir o limite antes de fechar | Limite de quebra só o Dono; fundo de troco e sangria, os dois | **O8** |
| 20 | **Maître cobra, mas não vê valores?** | Item G o inclui em "cobrar e receber dinheiro" e diz que ele "não vê valores detalhados" | Vê o valor da mesa que está cobrando; não vê caixa nem taxas | O8 |
| 21 | **Estorno: quem arca com a tarifa do Asaas?** | Se a tarifa não voltar no estorno, o restaurante pagou taxa sobre uma venda desfeita. Depende também do spike | Devolve a taxa NOOWE Pay; a tarifa não recuperada entra na compensação | **M2** |
| 22 | **Compensação × Créditos NOOWE Pay** | Item 8 chama a diferença negativa de "crédito na mensalidade". Se for o mesmo crédito do item D, cai no limite de 30%, expira e se perde ao cancelar, e aí o restaurante pagaria mais que a taxa | Razão separado, sem limite nem validade, abate 100% da fatura | **M2** |
| 23 | **Plano com Tap to Pay sem Tap** | O Profissional vende um recurso sem fornecedor contratado | Fica fora da lista do plano até o contrato | M4 |
| 24 | **Franquia do Business e preço do Enterprise** | Item C diz "franquia ampliada", sem número | Nenhum; sem número não há cálculo de excedente | **M4** |
| 25 | **O que conta como "pedido" na franquia?** | Cada envio à cozinha ou cada comanda? Uma mesa de 6 pedindo em 4 rodadas dá 4 ou 1 | Cada registro em `orders` não cancelado | **M4** |
| 26 | **Restaurantes que já existem** | Que plano recebem? Há período de teste? Os parceiros fundadores usam código? | Parceiros atuais sem cobrança até receberem código | **M4** |
| 27 | **"Dia operacional"** | Regras 2 e 3 dependem dele, e há casa que fecha depois da meia-noite | Vai do fechamento do caixa ao fechamento seguinte; sem caixa, corte às 6h | **O8** |
| 28 | **Nota da NOOWE** | Taxa de conveniência e fatura exigem nota de serviço emitida pela NOOWE, com CNPJ e emissor próprios. A conveniência também passa pela subconta do restaurante antes do split: o contador precisa validar | Nenhum; depende da contabilidade da NOOWE | **M3/M4** |
| 29 | **Gerente deduz a taxa** | Ele vê caixa líquido e comanda bruta, então calcula a taxa NOOWE Pay mesmo sem vê-la por pagamento | Mantém assim; não é segredo operacional | — |
| 30 | **Cliente cancela depois de enviar?** | Com o preparo automático, o pedido de salão e o Quick de aceite automático já nascem em preparo, sem intervalo para o cliente cancelar. O estorno automático por restaurante fechado também só alcança o aceite manual | Não cancela pelo app: pede ao garçom, e vai à aprovação do gerente. Se quiser uma janela, ela vira parâmetro de segundos | O1 |
| 31 | **Quando a mesa vira Conta pedida?** | Pedir a conta ou pagar uma parte, hoje a mesa segue Ocupada. Nesses estados o QR é recusado, então um amigo que chega no meio da divisão não entraria | Mesa segue Ocupada até a O4, e o QR continua aceito nesses dois estados | O4 |
