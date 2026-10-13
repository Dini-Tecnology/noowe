# ADR-017 — Restaurante com mais de um modelo na descoberta

**Status:** PROVISÓRIO (2026-10-13). Origem: Teste 15 ("Parrilaria Noowe" é Casual + Quick e só aparecia no Casual).
**Complementa:** ADR-003 (o ponto de entrada determina o modelo).
**Impacta:** lista da Home, página do restaurante, cardápio e carrinho do app do cliente.

## Decisão

1. `restaurants.service_models` espelha os modelos ativos do restaurante (derivados de `service_type` e
   `service_config.active_types` por `private.noowe_models_from_restaurant`, mantida por trigger). O cliente lê
   essa coluna; `restaurant_model_configs` continua só da equipe.
2. A Home filtra e monta os chips por `service_models`: um restaurante Casual + Quick aparece nos dois chips.
3. O chip escolhido é o ponto de entrada: abre o restaurante já na experiência daquele modelo
   (`Restaurant.serviceModel` e `VisitSession.serviceModel`).
4. Sem chip (busca, favoritos, mapa), a página do restaurante mostra um seletor **Na mesa | Retirada** quando há
   mais de uma experiência; sem escolha vale o tipo principal. Com mesa aberta, vale o modelo da mesa.
5. As ações continuam vindo das capabilities do modelo da jornada (`orderAhead`, `virtualQueue`, ...), nunca de
   `if (serviceModel === ...)`.
