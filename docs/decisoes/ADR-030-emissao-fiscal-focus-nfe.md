# ADR-030 — Focus NFe como emissor de NFC-e

**Status:** PROVISÓRIO — provedor escolhido pelo responsável do produto em 02/11/2026; regras fiscais abaixo aguardam a contabilidade e a homologação.
**Origem:** fatia N4 (critério 4), tarefa T-N4-03, spec §7.4
**Impacta:** N4, G3, Q1, T-N4-04 (cancelamento fiscal)
**Regras isoladas em função nomeada:** `private.fiscal_fee_in_document`, `private.fiscal_retry_policy`, `private.fiscal_issue_notice_cooldown`, `private.fiscal_enqueue_block_after`, `PAYMENT_CODE` e `focusPayment` em `_shared/fiscal/focus.ts`.

## Questão

O encerramento da conta precisa emitir NFC-e, e o recibo do app precisa citar o número emitido. O ADR-020 trata só do
pagamento, e a documentação do Asaas cobre NFS-e, não NFC-e. O adapter antigo da Focus saiu junto com o backend NestJS
(commit `540a6ef2`) e não servia de base: usava autenticação e nomes de campo diferentes da API atual e devolvia chave
de acesso falsa quando faltava token.

## Decisão

- **Emissor:** Focus NFe, API v2, atrás do contrato `FiscalProvider`. Certificado A1, CSC, numeração e contingência
  ficam na Focus. No Vault fica só o token da empresa (`fiscal_configs.focus_token_secret_id`).
- **Quando emite:** o encerramento em saldo zero (`private.close_session_if_settled`) e o pagamento confirmado de pedido
  sem sessão (gatilho em `orders.payment_status`). O gatilho olha a sessão, não `service_model`.
- **Uma nota por encerramento**, sem CPF do consumidor. Cada pagante recebe o próprio recibo, com a mesma nota.
- **O fechamento só grava na fila**, na mesma transação. O HTTP roda depois do commit, na Edge Function `fiscal-emit`,
  acionada pelo banco (`pg_net`) e reacionada a cada minuto pelo `pg_cron`. Falha do emissor nunca reabre a conta; falha
  ao enfileirar não desfaz o encerramento e grava `fiscal.enqueue_failed`, que a varredura reconcilia.
- **Falha ao enfileirar é reconciliada na varredura** (`20261102170000_fiscal_enqueue_recovery.sql`). A varredura parte do
  rastro `fiscal.enqueue_failed`, não de "contas sem nota", porque fechamento manual e contas antigas também não têm nota, e
  chama de novo `private.fiscal_enqueue_session` e `private.fiscal_enqueue_order`. Recuperou: a nota entra na fila normal,
  com a mesma `external_ref`, e grava `fiscal.enqueue_recovered`.
- **Sem venda real, não há nota.** Pagamento simulado, conta sem pagamento e pedido estornado ou cancelado depois da falha
  gravam `fiscal.enqueue_not_applicable` e saem da varredura. Conta paga e sem linhas **não** entra nesse caso: pedido
  marcado `completed` depois do encerramento some de `private.session_lines`, e a nota continua devida.
- **Falha que persiste vira documento `blocked`** com `error_code = 'enqueue_failed'`, sem foto do encerramento. Assim ela
  entra na lista da gerência e dispara o aviso de nota parada, uma vez. O texto da lista é fixo; o erro técnico fica em
  `fiscal.enqueue_retry_failed`. A varredura segue tentando, com a espera de `private.fiscal_retry_policy` e sem limite de
  tentativas, e, quando conseguir, preenche o mesmo documento. O reenvio da gerência tenta na hora e, se ainda não der,
  responde erro e a nota continua na lista. Se a venda deixar de existir, o documento é apagado: ele nunca foi à Focus.
- **Provisório:** a falha só vira documento depois de 15 minutos (`private.fiscal_enqueue_block_after`). Antes disso a
  varredura tenta a cada minuto, sem avisar ninguém, porque falha passageira se resolve sozinha.
- **Idempotência:** `external_ref` único e estável (`s-<sessão>`, `o-<pedido>`) é a `ref` na Focus. Da segunda tentativa
  em diante a função consulta antes de reenviar, porque um timeout pode ter autorizado a nota.
- **Estados:** `pending → processing → authorized`. Falha transitória volta a `pending` com espera crescente. `rejected`
  (SEFAZ ou cadastro), `failed` (tentativas esgotadas) e `blocked` (sem configuração ou dado fiscal, antes de chamar a
  Focus) esperam a gerência, que reenvia por `restaurant_fiscal_retry`, com motivo em `audit_log` (invariante 8).
- **Ativar um restaurante não emite notas antigas:** elas ficam `blocked` até um reenvio registrado.
- **Pagamento simulado e pagamento tardio não viram nota.**
- **Webhook da Focus não é usado:** a NFC-e é síncrona. A API responde `autorizado` ou `erro_autorizacao` na mesma chamada.
- **A gerência cuida do cadastro pelo app** (`restaurant_fiscal_get_config`, `restaurant_fiscal_save_config`, dono e
  gerente). `fiscal_configs` segue fechada: o token entra por essas RPCs, vai para o Vault e não volta em nenhuma resposta,
  nem na auditoria. Token em branco mantém o atual. Salvar não libera nota parada: o reenvio é decisão registrada.
- **O app não escolhe o ambiente.** Cadastro novo nasce em homologação e salvar mantém o ambiente atual. A ida para
  produção segue por `service_fiscal_configure` até a homologação ser validada. **Provisório:** quando validar, decidir
  se dono ou gerente pode promover pelo app.
- **Nota parada avisa dono e gerente da unidade** (`20261102161000_fiscal_issue_notice.sql`), pelo push de equipe, com toque
  na lista de notas e na unidade certa. O gatilho é a transição para `blocked`, `rejected` ou `failed`: varredura e resultado
  repetido não avisam de novo; reenvio que para outra vez, sim. O texto é fixo, sem `error_message`. Falha no aviso não
  desfaz o resultado fiscal e grava `fiscal.issue_notice_failed`.
- **Provisório:** com outra nota já parada na unidade, a pessoa avisada há menos de 24 horas não recebe novo push
  (`private.fiscal_issue_notice_cooldown`). A nota entra na lista do mesmo jeito. Sem isso, restaurante sem cadastro fiscal
  ou com token vencido recebe um push por conta encerrada.

## Valores provisórios, a validar

1. **Gorjeta fica fora da nota.** Não é venda do estabelecimento.
2. **Taxa de serviço fica fora da nota por padrão.** `fiscal_configs.service_fee_in_document` a inclui como
   `valor_outras_despesas`. Nos dois casos a soma das formas de pagamento é exatamente o total da nota. **Contabilidade.**
3. **`tipo_integracao = 2` em cartão e PIX.** A venda online seria "integrada" (1), o que exige CNPJ da credenciadora e
   número de autorização, dados que hoje não guardamos do Asaas. **Contabilidade e homologação.**
4. **Código das formas de pagamento:** PIX `17`, crédito `03`, débito `04`, carteira `18`, dinheiro `01`, TAP e carteiras
   digitais `03`.
5. **Tributação:** padrão por restaurante em `fiscal_configs.tax_defaults`; NCM e CFOP do item valem quando preenchidos,
   e o NCM `00000000` conta como vazio. **Contabilidade.**

## Fora desta decisão

- Cancelamento fiscal e estorno: T-N4-04. Até lá, nota autorizada de pedido estornado depende de cancelamento manual, e
  o prazo de cancelamento da NFC-e é curto (a Focus documenta 30 minutos).
- Reabrir conta já encerrada: a mesma `external_ref` não gera segunda nota. O ADR-004 pede nota complementar ou
  cancelamento, e isso precisa ser resolvido com T-N4-04.
- Fechamento manual com motivo (`20261025101000`) não emite nota: decisão pendente.
- Retorno assíncrono da contingência (`nfce_consulta_automatica`): a nota em contingência fica marcada, mas um erro
  posterior na retransmissão não volta ao NOOWE.

## Consequências

- Nada foi emitido contra a Focus real até obter token de homologação (`ACOES_HUMANAS_PUBLICACAO.md`).
- `fiscal_documents` deixa de carregar valor em `numeric`; `fiscal_configs` deixa de guardar segredos em texto.
- A migration recusa rodar se essas tabelas tiverem linhas do backend antigo, para não descartar segredo sem revisão.
- O limite de identificação do consumidor (notas de valor alto) não é tratado: a rejeição cai em `rejected` e a gerência
  decide.
