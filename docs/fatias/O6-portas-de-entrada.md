# O6 — Portas de entrada por serviço

**Objetivo:** reserva, fila e QR terminam em comanda aberta, mesa e garçom, sem digitação.
**Depende de:** O2, O5 · **Spec:** aditivo §3 · **ADRs:** 027, 021, 016 · **Bloqueada em parte:** pendência 10

## Critérios de aceite
1. Reserva dentro das regras confirma sozinha e segura mesa; fora, vira tarefa de aprovação ao Maître e ao Gerente.
2. Sem confirmação em 24 h, a reserva fica "Não confirmada" e não é cancelada.
3. Início do turno monta o plano da noite e envia a cada garçom com a ficha do cliente.
4. Check-in abre comanda, vincula mesa e garçom e copia alergias; Maître recebe "Conduzir à Mesa X".
5. Alerta na metade da tolerância; no fim, no-show automático e mesa liberada.
6. Mesa liberada chama o próximo da fila compatível; quem não se apresenta recua e, na segunda vez, sai.
7. Pedidos na espera vão ao Bar com destino "Área de espera" e entram na comanda ao sentar.
8. Cada item do cardápio indica os serviços em que aparece.
