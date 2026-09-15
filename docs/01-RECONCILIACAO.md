# Reconciliação — spec × código existente

**Faça isto antes de implementar qualquer fatia.**

O repositório tem um MVP parcial, possivelmente derivado das demos interativas que originaram a
spec. Implementar fatias sem saber o que já existe produz três falhas caras: reescrever o que
funciona, duplicar com nome diferente, e — a pior — deixar duas implementações da mesma regra
divergindo em silêncio (dois cálculos de split, dois roteamentos de estação).

## Procedimento

Rode isto numa sessão dedicada do Claude Code, sem implementar nada:

```
Faça a reconciliação entre a especificação e este repositório. NÃO escreva código.

1. Leia docs/fatias/README.md para conhecer as 18 fatias.
2. Para cada fatia, procure no repositório o que já existe: tabelas, migrations,
   RPCs, telas, hooks, testes.
3. Classifique cada fatia em:
   - COMPLETA    — existe e atende aos critérios de aceite
   - PARCIAL     — existe parte; liste o que falta
   - DIVERGENTE  — existe, mas contradiz a spec ou um ADR; descreva a divergência
   - AUSENTE     — não existe
4. Liste separadamente todo código que implementa regra de negócio e NÃO tem
   correspondência em nenhuma fatia — pode ser requisito não documentado.
5. Escreva o resultado em docs/RECONCILIACAO-RESULTADO.md, com caminhos de arquivo
   e números de linha.

Não decida nada sobre as divergências. Só descreva.
```

## Varreduras específicas que valem a pena

Depois do mapa geral, estas cinco encontram os problemas mais caros de corrigir tarde:

```
1. Dinheiro em float
   Procure colunas numeric/real/double precision e variáveis de valor em Number.
   Toda ocorrência é migração de dados pendente (CLAUDE.md, invariante 1).

2. Cálculo de valor no cliente
   Procure, no app React Native, qualquer aritmética que produza um valor cobrado:
   total, taxa, desconto, split. Tudo isso precisa migrar para RPC (invariante 2).

3. Ramificação por modelo de serviço
   grep por 'fine_dining' | 'casual_dining' | 'quick_service' fora de capabilities.ts.
   Cada ocorrência é um ponto que vai divergir entre os modelos.

4. Tabelas sem RLS
   Liste tabelas de negócio com RLS desabilitado. Cada uma vaza dado entre
   estabelecimentos, inclusive por Realtime (invariante 9).

5. Escrita direta de orders.status
   Procure updates que escrevem status de pedido diretamente em vez de derivá-lo
   dos itens (invariante 5). É a causa raiz de pedido "pronto" com item em preparo.
```

## O que fazer com o resultado

| Classificação | Ação |
|---|---|
| COMPLETA | Não toque. Adicione só os testes dos critérios de aceite que faltarem. |
| PARCIAL | A fatia vira "completar", não "implementar". Reduza o escopo ao que falta. |
| DIVERGENTE | **Pare.** Decisão humana: a spec muda ou o código muda? Registre num ADR novo. |
| AUSENTE | Fatia inteira, na ordem do grafo. |

Código sem fatia correspondente (item 4) merece atenção: ou é requisito real que a spec
esqueceu — e então a spec precisa ser atualizada — ou é código morto. Nenhum dos dois se
resolve ignorando.

## Resultado esperado

Ao final você tem `docs/RECONCILIACAO-RESULTADO.md` e sabe, para cada uma das 18 fatias, se
ela é trabalho novo, complemento, ou conversa a ter. Só então começa a implementação.
