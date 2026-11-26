# ADR-033 — Notaas substitui a Focus NFe na emissão da NFC-e

**Status:** PROVISÓRIO. O responsável do produto autorizou em 26/11/2026. A homologação contra a API real ainda não foi feita.
**Substitui:** o provedor do ADR-030. As demais regras do ADR-030 continuam valendo: fila, varredura, avisos, reenvio, cancelamento e valores fiscais a validar.
**Código:** `platform/supabase/functions/_shared/fiscal/notaas.ts`, `fiscal-emit/handler.ts`, `migrations/20261126160000_fiscal_notaas.sql`

## Questão

A Focus nunca foi contratada nem testada. A Notaas emite NFC-e (modelo 65) e NFS-e na mesma conta, cadastra empresa, certificado e CSC por API (Org API) e cobra um plano por CNPJs ilimitados. A integração continua atrás do contrato `FiscalProvider`.

## Decisão

- **Emissor:** Notaas, com base `https://platform.notaas.com.br/api/v1` e header `x-api-key`.
  - Cada restaurante é um projeto na Notaas, com a sua chave. A chave fica no Vault, em `fiscal_configs.focus_token_secret_id`. O nome da coluna ficou da Focus para não reescrever cinco funções.
  - O emitente é o CNPJ do projeto da chave.
- **Emissão assíncrona:**
  - `POST /nfe/emitir` responde 202 com `invoiceId`.
  - A Edge Function espera até 3 consultas, com 2 s entre elas, para o recibo já sair com número. Depois disso a nota volta para a fila como transitória, com o ID gravado em `fiscal_documents.provider_ref`. A varredura de 1 em 1 minuto consulta de novo.
- **A Notaas não busca nota por referência nossa:** consulta e cancelamento usam `provider_ref`. Com o ID gravado, nenhuma rodada reenvia: só consulta.
- **Idempotência:**
  - `Idempotency-Key = <external_ref>:<16 hex do sha-256 do corpo>`.
  - O corpo não leva `dataEmissao`. A Notaas usa a hora do processamento, o que atende o limite de 5 minutos da NFC-e e mantém o corpo igual entre tentativas.
  - Mesmo corpo é deduplicado. Corpo corrigido pela gerência (NCM, CFOP) gera nota nova.
- **Atalho com limite conhecido:**
  - Se a gravação do ID falhar logo depois do 202 e o corpo mudar antes da próxima rodada, a Notaas responde 409.
  - Nesse caso não há como achar a nota original: o documento vai a `failed` e a gerência decide.
  - Quando a Notaas oferecer busca por referência ou devolver o ID no 409, isso deve ser trocado.
- **Reenvio da gerência:** nota `rejected` perde o `provider_ref`, porque a correção precisa de nota nova. Nota `failed` mantém o ID e segue consultando a mesma nota.
- **Ambiente:**
  - É escolhido no projeto da Notaas. O host é um só.
  - A consulta confere o `tpAmb` da nota com o `environment` configurado. Se forem diferentes, a nota fica `rejected 'environment_mismatch'`, para nota de produção nunca aparecer como teste, nem o contrário.
- **QR Code e contingência:** são lidos do status quando ele traz. Senão, vêm do XML autorizado: `qrCode`, `urlChave` e `tpEmis` diferente de 1.
- **Cancelamento:** consulta antes. Nota já cancelada fecha. Se não, `POST /nfe/cancelar` com `invoiceId` e `motivo`, e consulta até 3 vezes. Se ainda não cancelou, a próxima rodada começa pela consulta.
- **Erros:**
  - Rede, 429 e 5xx são transitórios.
  - 400, 401, 403 (inclusive créditos esgotados) e 422 vão para a gerência.
- **Sem webhook:** a varredura já cobre o fluxo assíncrono.

## A validar em homologação

1. O caminho `/nfe/emitir`: um exemplo da documentação usa `/emitir`.
2. Os nomes dos campos do status: `chaveAcesso`, `numero`, `serie`, `protocolo`, `pdfUrl`, `xmlUrl`, `tpAmb`, `cStat` e `xMotivo`. A página foi lida em parte por resumo.
3. Se o replay da `Idempotency-Key` devolve o `invoiceId`.
4. Contingência da NFC-e quando a SEFAZ cai: confirmada só por mensagem; a documentação cita apenas a NF-e.
5. `tipo_integracao` dos cartões e do PIX: a Notaas não documenta o campo, e ele saiu do corpo. Precisa da contabilidade (ADR-030, ponto 3).
6. Se `pdfUrl` abre sem a chave de API (o recibo do cliente usa esse link).

## Fora desta decisão

- **Org API:** criar projeto, enviar o A1 e cadastrar o CSC pelo app. Hoje isso é feito no painel da Notaas, e a chave é colada em Config > Fiscal.
- **Webhooks** (`nfce.issued`, `nfce.error`, `nfce.cancelled`).
