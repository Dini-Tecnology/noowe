# M1 — Parâmetros NOOWE

**Objetivo:** todo valor comercial vem de tabela no banco, alterável pela equipe NOOWE sem nova versão do app.
**Depende de:** — · **Spec:** `aditivo-comercial-e-pagamentos` item H · **ADRs:** 031 · **Invariantes:** 1, 9

## Entregáveis
- **Banco:** tabelas em `private` para taxa por meio de pagamento (padrão e por restaurante), conveniência, planos, recursos por plano, créditos, inadimplência e códigos promocionais, com histórico de alteração. Valores provisórios como carga inicial.
- **Docs:** `docs/PARAMETROS-NOOWE.md` ("Como ajustar os parâmetros": qual tabela, qual campo, exemplo).
- **Consultas internas:** margem por pagamento, diferenças a compensar, receita de conveniência, créditos gerados, usados, expirados e a liberar.

## Critérios de aceite
1. Nenhum literal de taxa, faixa, preço ou prazo comercial no código (varredura).
2. Cliente e equipe do restaurante não leem nem escrevem essas tabelas diretamente.
3. Valor específico do restaurante prevalece sobre o padrão.
4. A linha do vale recusa valor acima do teto.
5. Alterar um parâmetro não muda cobrança, fatura ou crédito já gerado.
6. Toda alteração registra autor, horário, antes e depois.
