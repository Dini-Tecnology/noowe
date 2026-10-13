# ADR-019 — Código de convite de 6 dígitos e proteção contra força bruta

**Status:** PROVISÓRIO (2026-10-14). Origem: spec §2.6 (link, QR no celular do anfitrião ou código de 6
dígitos) e G2 (tentativas limitadas).
**Impacta:** G2, convite do Casual, Edge Function `join-table-by-code`.
**Regras e valores em configuração:** `private.app_settings` (`guest_code_max_attempts`,
`guest_code_attempt_window_min`), `restaurant_model_configs.guest_link_ttl_min` e `guest_link_max_uses`,
variáveis `GUEST_CODE_IP_LIMIT` e `GUEST_CODE_IP_WINDOW_MIN` da função.

## Decisão

1. Um convite serve a todos os convidados e tem **link, QR no celular do anfitrião e código de 6 dígitos**.
   O código só entra por `service_join_table_by_code`, chamada apenas pela Edge Function (service_role).
2. O banco guarda **só o HMAC do código** (pepper em `private.app_secrets`): 6 dígitos em sha256 puro
   seriam reversíveis em 10⁶ tentativas.
3. O convite expira por TTL, por revogação e **ao fechar a conta**; respeita `max_uses`.
4. **Camadas contra força bruta:** limite por IP na função (janela fixa em `edge_rate_limits`) e limite por
   usuário no banco (5 erros em 15 min, em `private.table_invite_code_attempts`). A tentativa errada
   **retorna status** (`invalid`/`locked`) em vez de lançar exceção: uma exceção desfaria o registro e o
   limite nunca acumularia.
5. O limite "por sessão" da spec não existe, porque um código errado não identifica sessão. Fica por
   usuário e por IP, com o histórico das tentativas.
6. Entrada acima da lotação vira solicitação ao maître, como no link.

## Consequências

- Quem erra 5 vezes espera a janela passar, mesmo com o código certo.
- O mesmo `join_by_invite` atende token e código.
- Falta a tela de explicação de convite expirado (T-G2-07): hoje é um alerta.
