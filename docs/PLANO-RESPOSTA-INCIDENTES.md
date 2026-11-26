# Plano de resposta a incidentes de segurança com dados pessoais

Vale para qualquer evento que comprometa a confidencialidade, a integridade ou a disponibilidade de dados pessoais tratados
pela NOOWE (apps cliente e restaurante, painel, KDS, Supabase, Edge Functions, provedores como Asaas e Notaas).
Base: LGPD art. 48 e Resolução CD/ANPD nº 15/2024 (Regulamento de Comunicação de Incidente de Segurança).

## 1. Papéis

| Papel | Quem | Faz |
|---|---|---|
| Encarregado (DPO) | _definir nome e e-mail_ | Coordena, decide se comunica, fala com a ANPD e os titulares |
| Líder técnico do incidente | Responsável de plantão da engenharia | Contém, investiga, corrige, guarda evidências |
| Direção | Sócio responsável | Aprova a comunicação externa e gastos emergenciais |
| Jurídico | Assessoria contratada | Revisa comunicados e obrigações contratuais |
| Atendimento | Suporte | Responde titulares e restaurantes com o texto aprovado |

Canal interno único: _definir (grupo/canal dedicado)_. Contato público do encarregado publicado na Política de Privacidade.

## 2. Detecção

Fontes: alerta do Sentry, logs do Supabase (Postgres, Auth, Edge Functions), Security/Performance Advisor do Supabase,
relato de usuário ou restaurante, aviso de provedor, pesquisador externo.

Quem notar qualquer sinal abre o registro (seção 5) e avisa o líder técnico e o encarregado no canal. Não apagar nada.

Sinais típicos: política RLS errada ou tabela sem RLS; canal Realtime entregando dado de outro estabelecimento; chave
`service_role` ou de provedor exposta (repositório, app, log); acesso anômalo em `auth`; dump ou exportação não esperada.

## 3. Contenção (primeiras horas)

1. Estancar: corrigir ou desligar a política/endpoint/função; revogar e girar chaves expostas (Supabase, Asaas, Notaas);
   encerrar sessões afetadas; bloquear conta comprometida.
2. Vazamento por RLS ou Realtime: `alter table ... enable row level security` e política restritiva imediata; conferir
   com `get_advisors` (security); listar os canais/tabelas afetados e o período.
3. Preservar evidências: exportar logs do período, versão do código e das migrations, consultas que provam o alcance.
4. Medir: quais dados (comuns, sensíveis, financeiros, CPF), quantos titulares, quais estabelecimentos, desde quando.

## 4. Comunicação

**Avaliar risco ou dano relevante** (Res. 15/2024): há comunicação obrigatória quando o incidente pode afetar
significativamente interesses e direitos dos titulares e envolve, por exemplo, dados sensíveis, financeiros, de
autenticação, protegidos por sigilo, de crianças/adolescentes/idosos, ou em larga escala.

**ANPD:** em até **3 dias úteis** contados do conhecimento de que o incidente afetou dados pessoais, pelo formulário do
peticionamento eletrônico da ANPD. Se faltar informação, comunicar o que se sabe e complementar depois (prazo de
complementação de 20 dias úteis). Conteúdo: natureza e categorias dos dados, número de titulares, medidas técnicas de
segurança, riscos, motivo de eventual demora, medidas adotadas e a adotar, contato do encarregado.

**Titulares:** no mesmo prazo de **3 dias úteis**, em linguagem simples, por e-mail/notificação no app e, se não for
possível individualizar, aviso público. Dizer o que aconteceu, quais dados, riscos, o que a NOOWE fez e o que a pessoa
pode fazer (trocar senha, atenção a golpes, contestar cobrança).

**Restaurantes (controladores dos dados do salão):** avisar sem demora quando o incidente atingir dados que tratamos em
nome deles, para que cumpram a obrigação própria.

Decisão de não comunicar também é registrada, com a justificativa.

## 5. Registro

Todo incidente, comunicado ou não, fica registrado e guardado por no mínimo **5 anos** (Res. 15/2024): data do
conhecimento, descrição, dados e titulares afetados, avaliação de risco, medidas, comunicações feitas (data e protocolo)
e justificativas. Guardar em pasta restrita da diretoria; não em issue pública.

## 6. Revisão

Até 10 dias úteis após o encerramento: reunião sem culpados com causa raiz, linha do tempo e ações (teste pgTAP de RLS
para o caso, alerta novo, ajuste de processo), cada uma com dono e prazo. Este plano é revisado uma vez por ano ou após
cada incidente, e testado com um exercício simulado anual.
