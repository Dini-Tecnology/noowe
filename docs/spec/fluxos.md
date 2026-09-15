# Fluxos da spec, em texto

Os sete diagramas do documento original são imagens PNG (`diagramas/`). Um agente de código lê
mal imagens e não consegue fazer diff nelas. Abaixo, os mesmos fluxos transcritos em Mermaid —
**esta é a versão que deve ser lida e mantida**; os PNGs ficam como referência visual.

---

## 1. Amplitude dos modelos (spec §1.4)

> "Quanto mais amplo o modelo, mais módulos da jornada ficam ativos por padrão. O núcleo é o
> mesmo; muda o conjunto de módulos e as regras de fechamento."

| Fine Dining | Casual Dining | Quick Service |
|---|---|---|
| Reserva obrigatória | Fila virtual (preferencial) | Pedido antecipado |
| Fila virtual (fallback) | Reserva opcional | Combo builder |
| QR de mesa | QR de mesa | Pagamento antecipado |
| Convite por link | Convite por link | Preparo em 4 etapas |
| Comanda com convidados | Comanda por pessoa | Código de retirada |
| Chamados de sala | Modo família e festas | Cartão de selos |
| Split em 4 modos | Split em 4 modos | — |
| Pagamento no fim | Pagamento no fim | — |
| Fidelidade por níveis | — | — |

---

## 2. Fluxo de grupo — convite por link e check-in por capacidade (spec §2.6)

Vale para Fine Dining **e** Casual Dining.

```mermaid
flowchart TD
    A[Anfitrião faz check-in<br/>ou lê o QR da mesa] --> B[Sistema cria a sessão da mesa<br/>host + capacidade]
    B --> C[Anfitrião compartilha o link<br/>WhatsApp, QR ou código de 6 dígitos]
    C --> D[Convidado abre o link,<br/>autentica e escolhe o próprio nome]
    D --> E{Vagas ocupadas <<br/>capacidade da mesa?}
    E -->|sim| F[Entra como convidado da comanda]
    E -->|não| G[Pedido de exceção vai ao maitre:<br/>juntar mesas, trocar mesa ou recusar]
    F --> H[Itens ficam atribuídos a cada pessoa]
    H --> I[Fechamento: cada convidado paga<br/>a sua parte até saldo zero]
    G -.decisão registrada em auditoria.-> F
```

**Regras que o diagrama carrega:** o link expira ao encerrar a conta; convidado que sai deixa
os itens na mesa; o anfitrião pode remover convidado antes do pedido.

---

## 3. Mapa de processo por raia — do convite ao pagamento (spec §2.6)

```mermaid
sequenceDiagram
    participant C as Cliente / grupo
    participant R as Recepção / maitre
    participant K as Cozinha e bar
    participant X as Caixa e fiscal

    C->>R: Reserva ou fila virtual
    R->>C: Chamada e alocação da mesa
    C->>C: Check-in do anfitrião
    C->>R: Convite por link
    R->>C: Valida capacidade
    C->>K: Comanda por pessoa
    K->>C: Preparo por estação
    C->>X: Recebe, consome e fecha
    X->>X: Split, pagamento e fiscal
```

> **O estado da mesa muda em exatamente três pontos:** check-in (`occupied`), pedido confirmado
> (comanda ativa) e saldo zero (`available`). Qualquer outra escrita em `tables.status` é bug.

---

## 4. Casos de uso — jornada em grupo (spec §2.6)

```mermaid
flowchart LR
    A((Anfitrião)) --> UC1[Reservar mesa]
    A --> UC2[Entrar na fila virtual]
    A --> UC3[Fazer check-in na mesa]
    A --> UC4[Compartilhar link da jornada]
    A --> UC7[Dividir e pagar a conta]
    V((Convidado)) --> UC5[Entrar na comanda por link]
    V --> UC7
    M((Maitre / recepção)) --> UC1
    M --> UC2
    M --> UC3
    M --> UC6[Validar capacidade da mesa]
    G((Garçom)) --> UC6
    G --> UC7
```

---

## 5. Fluxograma — Fine Dining (spec §3)

Entrada por reserva obrigatória; fila virtual apenas como fallback controlado.

```mermaid
flowchart TD
    A[Cliente descobre o restaurante] --> B{Há disponibilidade<br/>na data e horário?}
    B -->|sim| C[Reserva confirmada<br/>código + capacidade]
    B -->|não| D[Fila virtual:<br/>posição e estimativa]
    D --> E[Chamada da fila<br/>tolerância configurável]
    C --> F[Compartilha link da jornada<br/>com os convidados]
    E --> F
    F --> G[Check-in na mesa:<br/>valida capacidade x grupo]
    G --> H[QR da mesa abre a comanda única]
    H --> I[Cardápio + harmonização]
    I --> J[Comanda com convidados nomeados]
    J --> K[KDS cozinha e bar<br/>status por item]
    K --> L[Serviço à mesa e chamados]
    L --> M[Fechamento: solo ou split em 4 modos]
    M --> N[Pagamento parcial até saldo zero]
    N --> O[Fiscal, recibo e pontos]
    O --> P[Mesa volta para available]
```

---

## 6. Fluxograma — Casual Dining (spec §4)

Entrada preferencial pela fila virtual; reserva opcional; QR de mesa como chave do grupo.

```mermaid
flowchart TD
    A[Cliente abre o restaurante no app] --> B{Quer entrar agora<br/>ou agendar?}
    B -->|agora| C[Fila virtual padrão:<br/>posição em tempo real]
    B -->|depois| D[Reserva opcional com horário]
    D --> E[Chamada do grupo + tolerância]
    C --> F[Pedidos de bebida durante a espera]
    E --> F
    F --> G[Check-in: mesa compatível<br/>com o tamanho do grupo]
    G --> H[QR na mesa abre a jornada do grupo]
    H --> I[Link compartilhado:<br/>cada pessoa entra na comanda]
    I --> J[Modo família, aniversário e festas]
    J --> K[Comanda por pessoa e envio ao KDS]
    K --> L[Serviço, alertas de alergia e apoio de sala]
    L --> M[Split: meus itens, igual,<br/>por item, valor fixo]
    M --> N[Taxa de serviço e gorjeta]
    N --> O[Pagamento, fiscal e recibo]
    O --> P[Avaliação e CRM]
```

> Note que os itens pedidos na espera **migram para a comanda** no check-in, sem relançamento —
> é o critério de aceite da spec §4.6 e a razão de a fatia E2 depender de N2.

---

## 7. Fluxograma — Quick Service (spec §5)

Sem reserva e sem serviço à mesa: pagamento antecipado e retirada por código.

```mermaid
flowchart TD
    A[Pedido antecipado ou QR no local] --> B[Combo builder em 3 etapas]
    B --> C[Carrinho e cupom]
    C --> D[Pagamento antecipado]
    D --> E{Capacidade da<br/>janela disponível?}
    E -->|não| F[App oferece a próxima janela<br/>ANTES de aceitar o pedido]
    E -->|sim| G[Produção no KDS:<br/>Recebido → Preparando → Conferência]
    G --> H[Pronto: push com código e balcão]
    H --> I[Retirada, avaliação e selo]
```

> A ordem aqui é a regra: **pagamento antes da produção** (protege a cozinha de pedidos
> fantasma, spec §5.4) e **verificação de capacidade antes de aceitar** — não depois.
