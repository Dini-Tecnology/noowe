# Validação das correções do QA de 25/11 — 27/11/2026

Ambiente: Supabase de desenvolvimento `eplivpvqemowmbivhfpx`, Asaas sandbox, simulador iOS (iPhone 17 Pro).
A validação no simulador foi feita por outra sessão (commits 02c0a659, d71f70c1, e4b11e1a, 6fd780a4); este arquivo junta os dois lados.

| Item | Resultado | Evidência | Pendente com |
|---|---|---|---|
| CI da main (Supabase do zero, cliente, restaurante, edge) | ok | os 4 jobs verdes no commit 86b0eeb3 | — |
| Testes 85 e 100 no banco do zero do CI | ok (corrigidos) | 85 dependia do fuso da hora do CI; 100 quebrava em funções agregadas | — |
| Trava de ambiente do Asaas (RV-18) não bloqueia o dev | ok | 0 `environment_mismatch` em `audit_logs`; 2 cobranças de cartão `completed` depois do deploy | — |
| PaymentSheet, Adicionar cartão, Meus cartões, Pix (simulador) | ok | commit 02c0a659 (achados corrigidos) | — |
| Cartão salvo aprovado no Asaas sandbox | ok | cartão de teste 4539…2220, cobrança `completed` | — |
| OP-01 cozinha × bar, Bar KDS, cancelar item com motivo (simulador) | ok | commits e4b11e1a, d71f70c1; sem motivo não muda; com motivo grava `audit_log` | — |
| Termos (re-aceite), troca de restaurante, escalas, fidelidade (simulador) | ok | commits 96a03273, d839070d, 6fd780a4 | — |
| Cartão recusado ao vivo (PAG-05) | bloqueado | o cartão "de recusa" 5184019740373151 foi aprovado no sandbox; falta o cartão/valor que o sandbox recusa | precisa de um cliente logado + cartão de recusa do sandbox |
| Pix confirmado pelo webhook, pontos creditados uma vez, extrato com líquido real | bloqueado | só coberto por pgTAP (98, 108, 69) | precisa de um cliente logado e de confirmar o Pix no painel do Asaas sandbox |
| CPF sem consentimento não é salvo (RV-09) ao vivo | parcial | pgTAP 99/110 e `payments-create/handler_test.ts` | precisa de um Pix real com CPF sem marcar "Salvar" |
| "Pix indisponível neste restaurante" (PAG-06b) | bloqueado | texto do Asaas suposto, nunca visto | precisa de um restaurante sem chave Pix no sandbox |
| Cortesia por item e "Pague no balcão" (simulador) | com a outra sessão | — | sessão "Correção de bugs" |
| NotaAS (FX-1..4) ao vivo | bloqueado | só testes | credenciais de homologação da NotaAS |

## Dados de teste no banco de dev
Os pedidos ff1ca755 e 8355aa97 (qa.ana, QA · Três Serviços, 27/11, em `preparing`) não foram criados por nenhuma das duas sessões. Não foram mexidos.
