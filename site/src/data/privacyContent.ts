import type { LegalSection } from '@/components/legal/LegalPageLayout';

export const privacySections: LegalSection[] = [
  {
    id: 'introducao',
    title: { pt: 'Introdução e Objetivo', en: 'Introduction and Purpose', es: 'Introducción y Objetivo' },
    keyPoint: {
      pt: 'Esta Política explica de forma clara como a NOOWE coleta, usa e protege seus dados pessoais, em conformidade com a LGPD.',
      en: 'This Policy clearly explains how NOOWE collects, uses, and protects your personal data, in compliance with LGPD (Brazilian data protection law).',
      es: 'Esta Política explica claramente cómo NOOWE recopila, usa y protege sus datos personales, en conformidad con la LGPD.',
    },
    content: {
      pt: `<p>1.1. A presente Política de Privacidade tem por objetivo informar como a DINI & CIA. TECNOLOGIA LTDA ("NOOWE", "Controlador") realiza o tratamento dos dados pessoais dos Usuários.</p>
<p>1.2. Esta Política atende ao princípio da transparência (Art. 6º, VI, LGPD) e ao dever de informação (Art. 9º, LGPD).</p>
<p>1.3. Esta Política é parte integrante e indissociável dos <a href="/terms" class="text-primary hover:underline">Termos de Uso</a> da plataforma NOOWE.</p>
<p><strong>1.3-A. Privacidade desde a Concepção (Privacy by Design)</strong></p>
<p>A NOOWE adota os 7 princípios de Privacy by Design (Art. 46, §2º, LGPD): (1) Proativo, não reativo; (2) Privacidade como padrão; (3) Privacidade incorporada ao design; (4) Funcionalidade total; (5) Segurança ponta-a-ponta (TLS 1.3, AES-256); (6) Transparência e visibilidade; (7) Respeito ao titular.</p>`,
      en: `<p>1.1. This Privacy Policy aims to inform how DINI & CIA. TECNOLOGIA LTDA ("NOOWE", "Controller") processes Users' personal data.</p>
<p>1.2. This Policy complies with the transparency principle (LGPD Art. 6, VI) and the duty to inform (LGPD Art. 9).</p>
<p>1.3. This Policy is an integral part of the <a href="/terms" class="text-primary hover:underline">Terms of Use</a> of the NOOWE platform.</p>
<p><strong>1.3-A. Privacy by Design</strong></p>
<p>NOOWE adopts the 7 principles of Privacy by Design (LGPD Art. 46, §2): (1) Proactive, not reactive; (2) Privacy as default; (3) Privacy embedded into design; (4) Full functionality; (5) End-to-end security (TLS 1.3, AES-256); (6) Transparency and visibility; (7) Respect for the data subject.</p>`,
      es: `<p>1.1. La presente Política tiene por objetivo informar cómo DINI & CIA. TECNOLOGIA LTDA ("NOOWE", "Controlador") realiza el tratamiento de los datos personales de los Usuarios.</p>
<p><strong>1.3-A. Privacidad desde el Diseño (Privacy by Design)</strong></p>
<p>NOOWE adopta los 7 principios de Privacy by Design: Proactivo, Privacidad como estándar, Privacidad incorporada, Funcionalidad total, Seguridad punta a punta, Transparencia, Respeto al titular.</p>`,
    },
  },
  {
    id: 'definicoes-privacidade',
    title: { pt: 'Definições', en: 'Definitions', es: 'Definiciones' },
    content: {
      pt: `<ul>
<li><strong>Dado Pessoal:</strong> Informação relacionada a pessoa natural identificada ou identificável (Art. 5º, I).</li>
<li><strong>Dado Pessoal Sensível:</strong> Dado sobre origem racial/étnica, convicção religiosa, opinião política, dado de saúde, vida sexual, dado genético ou biométrico (Art. 5º, II).</li>
<li><strong>Titular:</strong> Pessoa natural a quem se referem os dados pessoais.</li>
<li><strong>Controlador:</strong> Pessoa a quem competem as decisões referentes ao tratamento. Neste caso: DINI & CIA. TECNOLOGIA LTDA.</li>
<li><strong>Operador:</strong> Pessoa que realiza o tratamento em nome do controlador.</li>
<li><strong>Encarregado (DPO):</strong> Canal de comunicação entre controlador, titulares e ANPD.</li>
<li><strong>Tratamento:</strong> Toda operação realizada com dados pessoais: coleta, armazenamento, uso, compartilhamento, eliminação etc.</li>
<li><strong>Consentimento:</strong> Manifestação livre, informada e inequívoca de concordância com o tratamento.</li>
<li><strong>Anonimização:</strong> Meios técnicos para que um dado perca possibilidade de associação a um indivíduo.</li>
</ul>`,
      en: `<ul>
<li><strong>Personal Data:</strong> Information related to an identified or identifiable natural person (LGPD Art. 5, I).</li>
<li><strong>Sensitive Personal Data:</strong> Data about racial/ethnic origin, religious conviction, political opinion, health, sexual life, genetic or biometric data (Art. 5, II).</li>
<li><strong>Data Subject:</strong> Natural person to whom the personal data refers.</li>
<li><strong>Controller:</strong> Entity responsible for processing decisions. In this case: DINI & CIA. TECNOLOGIA LTDA.</li>
<li><strong>Processor:</strong> Entity that processes data on behalf of the controller.</li>
<li><strong>DPO (Data Protection Officer):</strong> Communication channel between controller, data subjects, and ANPD.</li>
<li><strong>Processing:</strong> Any operation performed on personal data: collection, storage, use, sharing, deletion, etc.</li>
<li><strong>Consent:</strong> Free, informed, and unambiguous expression of agreement with processing.</li>
<li><strong>Anonymization:</strong> Technical means to prevent data from being associated with an individual.</li>
</ul>`,
      es: `<ul>
<li><strong>Dato Personal:</strong> Información relacionada a persona natural identificada o identificable.</li>
<li><strong>Dato Personal Sensible:</strong> Dato sobre origen racial/étnico, convicción religiosa, opinión política, salud, vida sexual, dato genético o biométrico.</li>
<li><strong>Controlador:</strong> DINI & CIA. TECNOLOGIA LTDA.</li>
<li><strong>Tratamiento:</strong> Toda operación realizada con datos personales.</li>
<li><strong>Consentimiento:</strong> Manifestación libre, informada e inequívoca de conformidad.</li>
</ul>`,
    },
  },
  {
    id: 'bases-legais',
    title: { pt: 'Bases Legais para Tratamento', en: 'Legal Bases for Processing', es: 'Bases Legales para el Tratamiento' },
    keyPoint: {
      pt: 'Cada uso dos seus dados tem uma justificativa legal específica — nunca tratamos dados sem base na LGPD.',
      en: 'Every use of your data has a specific legal justification — we never process data without an LGPD legal basis.',
      es: 'Cada uso de sus datos tiene una justificación legal específica — nunca tratamos datos sin base en la LGPD.',
    },
    content: {
      pt: `<table><thead><tr><th>Base Legal</th><th>Descrição</th><th>Aplicação na NOOWE</th></tr></thead><tbody>
<tr><td>Art. 7º, I — Consentimento</td><td>Manifestação livre e informada</td><td>Marketing, newsletters, geolocalização, cookies não essenciais</td></tr>
<tr><td>Art. 7º, II — Obrigação Legal</td><td>Cumprimento de obrigação legal</td><td>Retenção de registros de acesso (6 meses), obrigações fiscais (7 anos)</td></tr>
<tr><td>Art. 7º, V — Execução de Contrato</td><td>Execução contratual</td><td>Criação de conta, pedidos, reservas, pagamentos, fidelidade</td></tr>
<tr><td>Art. 7º, IX — Legítimo Interesse</td><td>Interesses legítimos</td><td>Analytics, melhoria de serviços, prevenção a fraudes, segurança</td></tr>
<tr><td>Art. 11, II, g — Prevenção à Fraude</td><td>Segurança do titular (sensíveis)</td><td>Biometria facial, MFA, detecção de acessos suspeitos</td></tr>
</tbody></table>
<p>O tratamento de dados de menores de 18 anos requer consentimento específico dos pais ou responsáveis (Art. 14, LGPD).</p>`,
      en: `<table><thead><tr><th>Legal Basis</th><th>Description</th><th>NOOWE Application</th></tr></thead><tbody>
<tr><td>Art. 7, I — Consent</td><td>Free and informed expression</td><td>Marketing, newsletters, geolocation, non-essential cookies</td></tr>
<tr><td>Art. 7, II — Legal Obligation</td><td>Legal compliance</td><td>Access log retention (6 months), tax obligations (7 years)</td></tr>
<tr><td>Art. 7, V — Contract Performance</td><td>Contractual execution</td><td>Account creation, orders, reservations, payments, loyalty</td></tr>
<tr><td>Art. 7, IX — Legitimate Interest</td><td>Legitimate interests</td><td>Analytics, service improvement, fraud prevention, security</td></tr>
<tr><td>Art. 11, II, g — Fraud Prevention</td><td>Data subject security (sensitive)</td><td>Facial biometrics, MFA, suspicious access detection</td></tr>
</tbody></table>
<p>Processing data of minors under 18 requires specific parental consent (LGPD Art. 14).</p>`,
      es: `<table><thead><tr><th>Base Legal</th><th>Descripción</th><th>Aplicación en NOOWE</th></tr></thead><tbody>
<tr><td>Art. 7, I — Consentimiento</td><td>Manifestación libre e informada</td><td>Marketing, newsletters, geolocalización</td></tr>
<tr><td>Art. 7, V — Ejecución Contractual</td><td>Ejecución del contrato</td><td>Cuenta, pedidos, reservas, pagos, fidelidad</td></tr>
<tr><td>Art. 7, IX — Interés Legítimo</td><td>Intereses legítimos</td><td>Analytics, mejora de servicios, seguridad</td></tr>
</tbody></table>`,
    },
  },
  {
    id: 'controlador',
    title: { pt: 'Identificação do Controlador', en: 'Controller Identification', es: 'Identificación del Controlador' },
    content: {
      pt: `<table><tbody>
<tr><td><strong>Controlador</strong></td><td>DINI & CIA. TECNOLOGIA LTDA</td></tr>
<tr><td><strong>CNPJ</strong></td><td>64.159.447/0001-90</td></tr>
<tr><td><strong>Endereço</strong></td><td>Av. José Ribeiro Junqueira, 220, Jardim Colonial, São Paulo/SP, CEP 04821-020</td></tr>
<tr><td><strong>E-mail</strong></td><td>contact@noowebr.com</td></tr>
</tbody></table>`,
      en: `<table><tbody>
<tr><td><strong>Controller</strong></td><td>DINI & CIA. TECNOLOGIA LTDA</td></tr>
<tr><td><strong>CNPJ</strong></td><td>64.159.447/0001-90</td></tr>
<tr><td><strong>Address</strong></td><td>Av. José Ribeiro Junqueira, 220, Jardim Colonial, São Paulo/SP, Brazil, 04821-020</td></tr>
<tr><td><strong>Email</strong></td><td>contact@noowebr.com</td></tr>
</tbody></table>`,
      es: `<table><tbody>
<tr><td><strong>Controlador</strong></td><td>DINI & CIA. TECNOLOGIA LTDA</td></tr>
<tr><td><strong>CNPJ</strong></td><td>64.159.447/0001-90</td></tr>
<tr><td><strong>Correo</strong></td><td>contact@noowebr.com</td></tr>
</tbody></table>`,
    },
  },
  {
    id: 'operadores',
    title: { pt: 'Identificação dos Operadores', en: 'Processor Identification', es: 'Identificación de los Operadores' },
    content: {
      pt: `<p>A NOOWE contrata operadores (subprocessadores) incluindo:</p>
<ul>
<li>Provedores de infraestrutura em nuvem</li>
<li>Gateways e processadores de pagamento certificados PCI DSS</li>
<li>Serviços de envio de SMS/OTP (autenticação)</li>
<li>Serviços de notificação push (Firebase Cloud Messaging)</li>
<li>Ferramentas de analytics e monitoramento</li>
<li>Serviços de autenticação social (Google OAuth 2.0, Apple Sign In)</li>
</ul>
<p>Todos são obrigados contratualmente a tratar dados conforme instruções da NOOWE, implementar segurança adequada e notificar incidentes imediatamente.</p>
<p><strong>5.1. Acordos de Tratamento de Dados (DPA).</strong> A NOOWE firma DPAs com todos os operadores, conforme Art. 39 da LGPD.</p>`,
      en: `<p>NOOWE contracts processors (sub-processors) including:</p>
<ul>
<li>Cloud infrastructure providers</li>
<li>PCI DSS certified payment gateways and processors</li>
<li>SMS/OTP services for authentication</li>
<li>Push notification services (Firebase Cloud Messaging)</li>
<li>Analytics and monitoring tools</li>
<li>Social authentication services (Google OAuth 2.0, Apple Sign In)</li>
</ul>
<p>All are contractually bound to process data per NOOWE's instructions, implement adequate security, and report incidents immediately.</p>
<p><strong>5.1. Data Processing Agreements (DPA).</strong> NOOWE signs DPAs with all processors per LGPD Art. 39.</p>`,
      es: `<p>NOOWE contrata operadores (subprocesadores) incluyendo proveedores de infraestructura en nube, gateways de pago PCI DSS, servicios de SMS/OTP, Firebase Cloud Messaging, analytics y autenticación social.</p>
<p>Todos están obligados contractualmente a tratar datos según instrucciones de NOOWE.</p>`,
    },
  },
  {
    id: 'dpo',
    title: { pt: 'Encarregado de Proteção de Dados (DPO)', en: 'Data Protection Officer (DPO)', es: 'Encargado de Protección de Datos (DPO)' },
    content: {
      pt: `<table><tbody>
<tr><td><strong>Encarregado (DPO)</strong></td><td>Carolina Dini Silva de Paula</td></tr>
<tr><td><strong>E-mail de contato</strong></td><td>privacy@noowebr.com</td></tr>
</tbody></table>
<p>O Encarregado é responsável por: aceitar reclamações dos titulares; prestar esclarecimentos; receber comunicações da ANPD; orientar funcionários sobre proteção de dados.</p>`,
      en: `<table><tbody>
<tr><td><strong>DPO</strong></td><td>Carolina Dini Silva de Paula</td></tr>
<tr><td><strong>Contact Email</strong></td><td>privacy@noowebr.com</td></tr>
</tbody></table>
<p>The DPO is responsible for: accepting data subject complaints; providing clarifications; receiving ANPD communications; guiding employees on data protection.</p>`,
      es: `<table><tbody>
<tr><td><strong>DPO</strong></td><td>Carolina Dini Silva de Paula</td></tr>
<tr><td><strong>Correo</strong></td><td>privacy@noowebr.com</td></tr>
</tbody></table>`,
    },
  },
  {
    id: 'direitos-titular',
    title: { pt: 'Direitos do Titular dos Dados Pessoais', en: 'Data Subject Rights', es: 'Derechos del Titular de Datos Personales' },
    keyPoint: {
      pt: 'Você pode acessar, corrigir, portar (JSON/CSV), eliminar seus dados e revogar consentimento a qualquer momento.',
      en: 'You can access, correct, port (JSON/CSV), delete your data, and revoke consent at any time.',
      es: 'Puede acceder, corregir, portar (JSON/CSV), eliminar sus datos y revocar su consentimiento en cualquier momento.',
    },
    content: {
      pt: `<table><thead><tr><th>Direito</th><th>Base Legal</th><th>Descrição</th></tr></thead><tbody>
<tr><td>Confirmação e Acesso</td><td>Art. 18, I e II</td><td>Obter confirmação da existência de tratamento e acessar seus dados</td></tr>
<tr><td>Retificação</td><td>Art. 18, III</td><td>Solicitar correção de dados incompletos ou inexatos</td></tr>
<tr><td>Anonimização/Eliminação</td><td>Art. 18, IV</td><td>Exigir tratamento de dados desnecessários ou excessivos</td></tr>
<tr><td>Portabilidade</td><td>Art. 18, V</td><td>Portar dados em formato JSON/CSV</td></tr>
<tr><td>Eliminação (consentimento)</td><td>Art. 18, VI</td><td>Eliminação de dados tratados com base no consentimento</td></tr>
<tr><td>Revogação do Consentimento</td><td>Art. 18, IX</td><td>Revogar consentimento a qualquer momento, gratuitamente</td></tr>
<tr><td>Revisão de Decisões Automatizadas</td><td>Art. 20</td><td>Solicitar revisão humana de decisões automatizadas</td></tr>
</tbody></table>
<p>7.2. Canais: configurações de privacidade do app, privacy@noowebr.com ou DPO. Prazo: 15 dias (simplificado) ou 30 dias (fundamentado).</p>
<p><strong>7.3. Portabilidade:</strong> formato JSON ou CSV; escopo inclui dados fornecidos e gerados pela interação; NÃO inclui dados derivados ou inferenciais (segredo comercial); prazo: 15 dias; arquivo protegido por senha com link único (72h).</p>`,
      en: `<table><thead><tr><th>Right</th><th>Legal Basis</th><th>Description</th></tr></thead><tbody>
<tr><td>Confirmation and Access</td><td>Art. 18, I-II</td><td>Confirm existence of processing and access your data</td></tr>
<tr><td>Rectification</td><td>Art. 18, III</td><td>Request correction of incomplete or inaccurate data</td></tr>
<tr><td>Anonymization/Deletion</td><td>Art. 18, IV</td><td>Require treatment of unnecessary or excessive data</td></tr>
<tr><td>Portability</td><td>Art. 18, V</td><td>Port data in JSON/CSV format</td></tr>
<tr><td>Consent Revocation</td><td>Art. 18, IX</td><td>Revoke consent at any time, free of charge</td></tr>
<tr><td>Review of Automated Decisions</td><td>Art. 20</td><td>Request human review of automated decisions</td></tr>
</tbody></table>
<p>7.2. Channels: app privacy settings, privacy@noowebr.com, or DPO. Response: 15 days (simplified) or 30 days (detailed).</p>`,
      es: `<table><thead><tr><th>Derecho</th><th>Base Legal</th><th>Descripción</th></tr></thead><tbody>
<tr><td>Confirmación y Acceso</td><td>Art. 18, I-II</td><td>Confirmar existencia de tratamiento y acceder a sus datos</td></tr>
<tr><td>Rectificación</td><td>Art. 18, III</td><td>Solicitar corrección de datos incompletos</td></tr>
<tr><td>Portabilidad</td><td>Art. 18, V</td><td>Portar datos en formato JSON/CSV</td></tr>
<tr><td>Revocación del Consentimiento</td><td>Art. 18, IX</td><td>Revocar consentimiento en cualquier momento</td></tr>
</tbody></table>`,
    },
  },
  {
    id: 'dados-tratados',
    title: { pt: 'Quais Dados Pessoais São Tratados', en: 'What Personal Data Is Processed', es: 'Qué Datos Personales Se Tratan' },
    keyPoint: {
      pt: 'Coletamos apenas os dados necessários para cada funcionalidade. Dados de cartão NUNCA são armazenados — são tokenizados.',
      en: 'We collect only the data necessary for each feature. Card data is NEVER stored — it is tokenized.',
      es: 'Recopilamos solo los datos necesarios para cada funcionalidad. Los datos de tarjeta NUNCA se almacenan — se tokenizan.',
    },
    content: {
      pt: `<p><strong>8.1. Dados do Usuário Consumidor</strong></p>
<table><thead><tr><th>Categoria</th><th>Dados</th><th>Finalidade</th></tr></thead><tbody>
<tr><td>Cadastro</td><td>Nome, CPF, e-mail, telefone, data de nascimento, foto</td><td>Criação de conta, identificação</td></tr>
<tr><td>Autenticação</td><td>Telefone (OTP), biometria, OAuth, hash de senha</td><td>Login seguro, prevenção a fraudes</td></tr>
<tr><td>Localização</td><td>GPS, endereço cadastrado</td><td>Descoberta de restaurantes próximos</td></tr>
<tr><td>Pedidos</td><td>Histórico, preferências, avaliações, favoritos</td><td>Gestão de pedidos, recomendações</td></tr>
<tr><td>Financeiros</td><td>Tokens de pagamento (NUNCA dados brutos), transações, saldo</td><td>Processamento de pagamentos</td></tr>
<tr><td>Fidelidade</td><td>Pontos, nível, recompensas</td><td>Programa de fidelidade</td></tr>
<tr><td>Navegação</td><td>IP, dispositivo, SO, navegador, cookies, logs</td><td>Segurança, analytics, compliance</td></tr>
</tbody></table>
<p><strong>8.2. Dados do Estabelecimento / Staff:</strong> Razão social, CNPJ, equipe (cargo RBAC, métricas), dados operacionais (cardápio, planta, estoque), dados financeiros, analytics.</p>
<p><strong>8.3. Site e Demo:</strong> Dados de formulários, navegação e interações com a demo (anonimizados).</p>`,
      en: `<p><strong>8.1. Consumer User Data</strong></p>
<table><thead><tr><th>Category</th><th>Data</th><th>Purpose</th></tr></thead><tbody>
<tr><td>Registration</td><td>Name, ID, email, phone, date of birth, photo</td><td>Account creation, identification</td></tr>
<tr><td>Authentication</td><td>Phone (OTP), biometrics, OAuth, password hash</td><td>Secure login, fraud prevention</td></tr>
<tr><td>Location</td><td>GPS, registered address</td><td>Nearby restaurant discovery</td></tr>
<tr><td>Orders</td><td>History, preferences, reviews, favorites</td><td>Order management, recommendations</td></tr>
<tr><td>Financial</td><td>Payment tokens (NEVER raw data), transactions, balance</td><td>Payment processing</td></tr>
<tr><td>Loyalty</td><td>Points, tier, rewards</td><td>Loyalty program</td></tr>
<tr><td>Browsing</td><td>IP, device, OS, browser, cookies, logs</td><td>Security, analytics, compliance</td></tr>
</tbody></table>`,
      es: `<p><strong>8.1. Datos del Usuario Consumidor</strong></p>
<table><thead><tr><th>Categoría</th><th>Datos</th><th>Finalidad</th></tr></thead><tbody>
<tr><td>Registro</td><td>Nombre, documento, correo, teléfono</td><td>Creación de cuenta</td></tr>
<tr><td>Autenticación</td><td>Teléfono (OTP), biometría, OAuth</td><td>Login seguro</td></tr>
<tr><td>Financieros</td><td>Tokens de pago (NUNCA datos brutos)</td><td>Procesamiento de pagos</td></tr>
</tbody></table>`,
    },
  },
  {
    id: 'como-coletados',
    title: { pt: 'Como os Dados São Coletados', en: 'How Data Is Collected', es: 'Cómo Se Recopilan los Datos' },
    content: {
      pt: `<ul>
<li><strong>Fornecimento direto:</strong> cadastro, formulários, preferências, avaliações e fotos.</li>
<li><strong>Autenticação via terceiros (OAuth):</strong> Google (nome, e-mail, ID), Apple Sign In (verificação RSA-SHA256).</li>
<li><strong>Coleta automática:</strong> geolocalização GPS (mediante consentimento), dados técnicos, biometria facial.</li>
<li><strong>Interação com a plataforma:</strong> pedidos, transações, reservas, fidelidade — registrados automaticamente.</li>
<li><strong>QR Codes:</strong> identifica estabelecimento e mesa, sem coleta adicional de dados pessoais.</li>
<li><strong>Cookies:</strong> cookies proprietários e de terceiros no site institucional.</li>
<li><strong>Gateways de pagamento:</strong> dados tokenizados — a NOOWE nunca recebe dados brutos de cartão.</li>
</ul>`,
      en: `<ul>
<li><strong>Direct provision:</strong> registration, forms, preferences, reviews, and photos.</li>
<li><strong>Third-party authentication (OAuth):</strong> Google (name, email, ID), Apple Sign In (RSA-SHA256 verification).</li>
<li><strong>Automatic collection:</strong> GPS geolocation (with consent), technical data, facial biometrics.</li>
<li><strong>Platform interaction:</strong> orders, transactions, reservations, loyalty — automatically recorded.</li>
<li><strong>QR Codes:</strong> identifies establishment and table, no additional personal data collected.</li>
<li><strong>Payment gateways:</strong> tokenized data — NOOWE never receives raw card data.</li>
</ul>`,
      es: `<ul>
<li><strong>Suministro directo:</strong> registro, formularios, preferencias.</li>
<li><strong>Autenticación via terceros:</strong> Google, Apple Sign In.</li>
<li><strong>Recopilación automática:</strong> geolocalización GPS (con consentimiento), datos técnicos.</li>
<li><strong>Gateways de pago:</strong> datos tokenizados — NOOWE nunca recibe datos brutos de tarjeta.</li>
</ul>`,
    },
  },
  {
    id: 'decisoes-automatizadas',
    title: { pt: 'Decisões Automatizadas e Profiling', en: 'Automated Decisions and Profiling', es: 'Decisiones Automatizadas y Profiling' },
    content: {
      pt: `<p><strong>10-A.1. Inventário de IA:</strong></p>
<ul>
<li>Recomendações de estabelecimentos e cardápio — sem decisão restritiva</li>
<li>Detecção de fraude — pode resultar em bloqueio temporário até verificação humana</li>
<li>Priorização no KDS — apenas operacional</li>
<li>Scoring de fidelidade — cálculo automatizado por regras pré-definidas</li>
</ul>
<p><strong>Garantias:</strong> Nenhuma decisão exclusivamente automatizada com efeitos jurídicos sem possibilidade de revisão humana. O titular pode solicitar revisão (Art. 20, LGPD). Avaliações periódicas de viés algorítmico.</p>
<p><strong>10.2. Comunicações obrigatórias</strong> que NÃO podem ser desativadas: confirmações de pedidos, alertas de segurança, atualizações de Termos e notificações de incidentes. Marketing é exclusivamente opt-in.</p>`,
      en: `<p><strong>10-A.1. AI Inventory:</strong></p>
<ul>
<li>Restaurant and menu recommendations — no restrictive decision</li>
<li>Fraud detection — may result in temporary block until human verification</li>
<li>KDS prioritization — operational only</li>
<li>Loyalty scoring — automated calculation by pre-defined rules</li>
</ul>
<p><strong>Guarantees:</strong> No exclusively automated decision with legal effects without human review possibility. Data subjects can request review (LGPD Art. 20). Periodic algorithmic bias assessments.</p>
<p><strong>10.2. Mandatory service communications</strong> that cannot be disabled: order confirmations, security alerts, Terms updates, and incident notifications. Marketing is exclusively opt-in.</p>`,
      es: `<p><strong>10-A.1. Inventario de IA:</strong> Recomendaciones, detección de fraude, priorización en KDS, scoring de fidelidad.</p>
<p><strong>Garantías:</strong> Ninguna decisión automatizada con efectos jurídicos sin posibilidad de revisión humana. Marketing es exclusivamente opt-in.</p>`,
    },
  },
  {
    id: 'compartilhamento',
    title: { pt: 'Compartilhamento de Dados', en: 'Data Sharing', es: 'Compartición de Datos' },
    keyPoint: {
      pt: 'A NOOWE NÃO vende dados pessoais. Compartilhamos apenas com parceiros operacionais essenciais, sempre com proteção contratual.',
      en: 'NOOWE does NOT sell personal data. We share only with essential operational partners, always with contractual protection.',
      es: 'NOOWE NO vende datos personales. Compartimos solo con socios operacionales esenciales, siempre con protección contractual.',
    },
    content: {
      pt: `<table><thead><tr><th>Destinatário</th><th>Dados</th><th>Finalidade</th></tr></thead><tbody>
<tr><td>Estabelecimentos parceiros</td><td>Nome, pedido, preferências, pagamento tokenizado</td><td>Processamento de pedidos e atendimento</td></tr>
<tr><td>Processadores de pagamento</td><td>Dados financeiros tokenizados</td><td>Processamento de transações</td></tr>
<tr><td>Provedores de infraestrutura</td><td>Dados operacionais</td><td>Cloud computing, hospedagem</td></tr>
<tr><td>Serviços de autenticação</td><td>ID e e-mail</td><td>Login social</td></tr>
<tr><td>Autoridades públicas</td><td>Dados exigidos por lei</td><td>Cumprimento de obrigação legal</td></tr>
</tbody></table>
<p><strong>A NOOWE NÃO vende dados pessoais de Usuários a terceiros.</strong></p>`,
      en: `<table><thead><tr><th>Recipient</th><th>Data</th><th>Purpose</th></tr></thead><tbody>
<tr><td>Partner establishments</td><td>Name, order, preferences, tokenized payment</td><td>Order processing and service</td></tr>
<tr><td>Payment processors</td><td>Tokenized financial data</td><td>Transaction processing</td></tr>
<tr><td>Infrastructure providers</td><td>Operational data</td><td>Cloud computing, hosting</td></tr>
<tr><td>Public authorities</td><td>Legally required data</td><td>Legal compliance</td></tr>
</tbody></table>
<p><strong>NOOWE does NOT sell Users' personal data to third parties.</strong></p>`,
      es: `<table><thead><tr><th>Destinatario</th><th>Datos</th><th>Finalidad</th></tr></thead><tbody>
<tr><td>Establecimientos socios</td><td>Nombre, pedido, preferencias</td><td>Procesamiento de pedidos</td></tr>
<tr><td>Procesadores de pago</td><td>Datos financieros tokenizados</td><td>Procesamiento de transacciones</td></tr>
</tbody></table>
<p><strong>NOOWE NO vende datos personales.</strong></p>`,
    },
  },
  {
    id: 'transferencia-internacional',
    title: { pt: 'Transferência Internacional de Dados', en: 'International Data Transfer', es: 'Transferencia Internacional de Datos' },
    content: {
      pt: `<p>12.1. Transferências para servidores fora do Brasil em conformidade com o Art. 33 da LGPD, quando o país proporcione proteção adequada ou mediante cláusulas contratuais específicas.</p>
<p><strong>12.3. Localização:</strong> Brasil (São Paulo), Estados Unidos (us-east-1, us-west-2), União Europeia (CDN). Com cláusulas contratuais padrão, SOC 2 Type II e ISO 27001.</p>`,
      en: `<p>12.1. Transfers to servers outside Brazil comply with LGPD Art. 33, when the country provides adequate protection or through specific contractual clauses.</p>
<p><strong>12.3. Server Locations:</strong> Brazil (São Paulo), United States (us-east-1, us-west-2), European Union (CDN). With standard contractual clauses, SOC 2 Type II, and ISO 27001.</p>`,
      es: `<p>12.1. Transferencias a servidores fuera de Brasil en conformidad con el Art. 33 de la LGPD.</p>
<p><strong>12.3. Ubicación:</strong> Brasil (São Paulo), Estados Unidos, Unión Europea (CDN).</p>`,
    },
  },
  {
    id: 'seguranca',
    title: { pt: 'Segurança dos Dados', en: 'Data Security', es: 'Seguridad de los Datos' },
    keyPoint: {
      pt: 'Proteção em 7 camadas: WAF, TLS 1.3, rate limiting, CSRF, Supabase Auth, validação, auditoria. Senhas gerenciadas pelo Supabase, dados em AES-256.',
      en: '7-layer protection: WAF, TLS 1.3, rate limiting, CSRF, Supabase Auth, validation, audit. Passwords managed by Supabase, data in AES-256.',
      es: 'Protección en 7 capas: WAF, TLS 1.3, rate limiting, CSRF, Supabase Auth, validación, auditoría. Contraseñas gestionadas por Supabase, datos en AES-256.',
    },
    content: {
      pt: `<table><thead><tr><th>Camada</th><th>Medida</th></tr></thead><tbody>
<tr><td>1: Perímetro</td><td>WAF e proteção contra DDoS</td></tr>
<tr><td>2: Transporte</td><td>TLS 1.3 obrigatório, HSTS, Certificate Pinning</td></tr>
<tr><td>3: Rate Limiting</td><td>5 req/15min (auth), 100 req/min (API geral)</td></tr>
<tr><td>4: CSRF</td><td>Double-submit cookie, SameSite=Strict</td></tr>
<tr><td>5: Autenticação</td><td>Supabase Auth, refresh token seguro, RLS, RBAC e MFA quando habilitado</td></tr>
<tr><td>6: Validação</td><td>Whitelist, queries parametrizadas, policies RLS e CSP</td></tr>
<tr><td>7: Auditoria</td><td>Logs JSON com correlation IDs, Sentry, tracing 10%</td></tr>
<tr><td>Banco de Dados</td><td>AES-256, backups criptografados, subnet privada</td></tr>
</tbody></table>
<p><strong>13.2. Comunicação de Incidentes:</strong> Conforme Art. 48 LGPD e Resolução ANPD nº 18/2024. Titulares notificados em até 72 horas.</p>`,
      en: `<table><thead><tr><th>Layer</th><th>Measure</th></tr></thead><tbody>
<tr><td>1: Perimeter</td><td>WAF and DDoS protection</td></tr>
<tr><td>2: Transport</td><td>Mandatory TLS 1.3, HSTS, Certificate Pinning</td></tr>
<tr><td>3: Rate Limiting</td><td>5 req/15min (auth), 100 req/min (general API)</td></tr>
<tr><td>4: CSRF</td><td>Double-submit cookie, SameSite=Strict</td></tr>
<tr><td>5: Authentication</td><td>Supabase Auth, secure refresh tokens, RLS, RBAC, and MFA when enabled</td></tr>
<tr><td>6: Validation</td><td>Whitelist, parameterized queries, RLS policies, and CSP</td></tr>
<tr><td>7: Audit</td><td>JSON logs with correlation IDs, Sentry, 10% tracing</td></tr>
<tr><td>Database</td><td>AES-256, encrypted backups, private subnet</td></tr>
</tbody></table>
<p><strong>13.2. Incident Communication:</strong> Per LGPD Art. 48. Data subjects notified within 72 hours.</p>`,
      es: `<table><thead><tr><th>Capa</th><th>Medida</th></tr></thead><tbody>
<tr><td>1: Perímetro</td><td>WAF y protección DDoS</td></tr>
<tr><td>2: Transporte</td><td>TLS 1.3 obligatorio</td></tr>
<tr><td>5: Autenticación</td><td>Supabase Auth, refresh tokens seguros, RLS, RBAC y MFA cuando esté habilitado</td></tr>
<tr><td>Base de Datos</td><td>AES-256, backups cifrados, subnet privada</td></tr>
</tbody></table>`,
    },
  },
  {
    id: 'cookies',
    title: { pt: 'Cookies e Tecnologias de Rastreamento', en: 'Cookies and Tracking Technologies', es: 'Cookies y Tecnologías de Rastreo' },
    content: {
      pt: `<table><thead><tr><th>Categoria</th><th>Finalidade</th><th>Duração</th><th>Gerenciamento</th></tr></thead><tbody>
<tr><td>Estritamente Necessários</td><td>Segurança, sessão, CSRF</td><td>Sessão</td><td>Sempre ativos</td></tr>
<tr><td>Preferências</td><td>Idioma, configurações</td><td>1 ano</td><td>Desativáveis</td></tr>
<tr><td>Estatísticas</td><td>Visitantes, páginas, origem</td><td>2 anos</td><td>Desativáveis</td></tr>
<tr><td>Marketing</td><td>Conversão, remarketing</td><td>90 dias</td><td>Desativáveis</td></tr>
</tbody></table>
<p>A revogação do consentimento para cookies é tão simples quanto sua concessão.</p>`,
      en: `<table><thead><tr><th>Category</th><th>Purpose</th><th>Duration</th><th>Management</th></tr></thead><tbody>
<tr><td>Strictly Necessary</td><td>Security, session, CSRF</td><td>Session</td><td>Always active</td></tr>
<tr><td>Preferences</td><td>Language, settings</td><td>1 year</td><td>Disableable</td></tr>
<tr><td>Statistics</td><td>Visitors, pages, source</td><td>2 years</td><td>Disableable</td></tr>
<tr><td>Marketing</td><td>Conversion, remarketing</td><td>90 days</td><td>Disableable</td></tr>
</tbody></table>
<p>Cookie consent revocation is as simple as its granting.</p>`,
      es: `<table><thead><tr><th>Categoría</th><th>Finalidad</th><th>Duración</th><th>Gestión</th></tr></thead><tbody>
<tr><td>Estrictamente Necesarias</td><td>Seguridad, sesión</td><td>Sesión</td><td>Siempre activas</td></tr>
<tr><td>Preferencias</td><td>Idioma, configuraciones</td><td>1 año</td><td>Desactivables</td></tr>
<tr><td>Marketing</td><td>Conversión, remarketing</td><td>90 días</td><td>Desactivables</td></tr>
</tbody></table>`,
    },
  },
  {
    id: 'retencao',
    title: { pt: 'Retenção e Eliminação de Dados', en: 'Data Retention and Deletion', es: 'Retención y Eliminación de Datos' },
    keyPoint: {
      pt: 'Mantemos seus dados apenas pelo tempo necessário. Contas inativas são anonimizadas após 2 anos.',
      en: 'We keep your data only as long as necessary. Inactive accounts are anonymized after 2 years.',
      es: 'Mantenemos sus datos solo el tiempo necesario. Cuentas inactivas se anonimizan después de 2 años.',
    },
    content: {
      pt: `<table><thead><tr><th>Tipo de Dado</th><th>Retenção</th><th>Justificativa</th></tr></thead><tbody>
<tr><td>Conta ativa</td><td>Enquanto ativa</td><td>Execução de contrato</td></tr>
<tr><td>Contas inativas</td><td>Anonimização após 2 anos</td><td>LGPD</td></tr>
<tr><td>Registros de acesso</td><td>6 meses</td><td>Marco Civil da Internet</td></tr>
<tr><td>Transações financeiras</td><td>7 anos</td><td>Compliance fiscal</td></tr>
<tr><td>Logs de auditoria</td><td>5 anos</td><td>Segurança</td></tr>
<tr><td>Marketing</td><td>Até revogação</td><td>Consentimento</td></tr>
</tbody></table>`,
      en: `<table><thead><tr><th>Data Type</th><th>Retention</th><th>Justification</th></tr></thead><tbody>
<tr><td>Active account</td><td>While active</td><td>Contract performance</td></tr>
<tr><td>Inactive accounts</td><td>Anonymized after 2 years</td><td>LGPD</td></tr>
<tr><td>Access logs</td><td>6 months</td><td>Marco Civil da Internet</td></tr>
<tr><td>Financial transactions</td><td>7 years</td><td>Tax compliance</td></tr>
<tr><td>Audit logs</td><td>5 years</td><td>Security</td></tr>
<tr><td>Marketing</td><td>Until revocation</td><td>Consent</td></tr>
</tbody></table>`,
      es: `<table><thead><tr><th>Tipo de Dato</th><th>Retención</th><th>Justificación</th></tr></thead><tbody>
<tr><td>Cuenta activa</td><td>Mientras esté activa</td><td>Ejecución contractual</td></tr>
<tr><td>Cuentas inactivas</td><td>Anonimización tras 2 años</td><td>LGPD</td></tr>
<tr><td>Transacciones financieras</td><td>7 años</td><td>Compliance fiscal</td></tr>
</tbody></table>`,
    },
  },
  {
    id: 'alteracoes-politica',
    title: { pt: 'Alterações nesta Política', en: 'Changes to this Policy', es: 'Cambios en esta Política' },
    content: {
      pt: `<p>17.1. Esta Política é revisada periodicamente para conformidade com legislação e orientações da ANPD.</p>
<p>17.2. Alterações substanciais comunicadas com 15 dias de antecedência via e-mail, push ou site. Novo consentimento será solicitado quando necessário.</p>
<p>17.3. Versão vigente sempre disponível em noowe.com.br/privacidade e no app.</p>`,
      en: `<p>17.1. This Policy is periodically reviewed for compliance with legislation and ANPD guidelines.</p>
<p>17.2. Substantial changes communicated 15 days in advance via email, push, or website. New consent will be requested when necessary.</p>`,
      es: `<p>17.1. Esta Política se revisa periódicamente.</p>
<p>17.2. Cambios sustanciales comunicados con 15 días de antelación.</p>`,
    },
  },
  {
    id: 'disposicoes-finais-privacidade',
    title: { pt: 'Disposições Finais', en: 'Final Provisions', es: 'Disposiciones Finales' },
    content: {
      pt: `<p>18.1. Esta Política é regida pela legislação brasileira: LGPD, Constituição Federal, Marco Civil da Internet, CDC.</p>
<p>18.2. O titular pode reclamar à ANPD (Art. 18, §1º), utilizar meios do CDC ou acessar PROCONs.</p>
<p>18.3. Todas as atividades de tratamento observam os princípios do Art. 6º da LGPD: finalidade, adequação, necessidade, livre acesso, qualidade, transparência, segurança, prevenção, não discriminação e responsabilização.</p>
<p><strong>18.4-A. Relatório de transparência.</strong> A NOOWE publicará anualmente relatório com: volume de solicitações de direitos, pedidos de dados por autoridades, incidentes comunicados e evolução das medidas de segurança.</p>
<p><strong>18.5-A. Programa de Governança em Privacidade:</strong> DPO com autonomia funcional; Registro de Operações de Tratamento (Art. 37); RIPD para operações de risco; treinamento obrigatório; auditorias trimestrais; pentests semestrais; DPAs com todos operadores.</p>
<p class="mt-6 text-center text-sm text-muted-foreground"><strong>DINI & CIA. TECNOLOGIA LTDA</strong><br/>CNPJ: 64.159.447/0001-90<br/>São Paulo, 22 de março de 2026.<br/><em>Versão 1.0 — Última atualização: 22/03/2026</em></p>`,
      en: `<p>18.1. This Policy is governed by Brazilian law: LGPD, Federal Constitution, Marco Civil da Internet, CDC.</p>
<p>18.2. The data subject may file complaints with ANPD, use consumer protection agencies, or access PROCONs.</p>
<p>18.3. All processing activities observe LGPD Art. 6 principles: purpose, adequacy, necessity, free access, quality, transparency, security, prevention, non-discrimination, and accountability.</p>
<p><strong>18.4-A. Transparency report.</strong> NOOWE will publish annually: volume of data subject requests, authority data requests, reported incidents, and security evolution.</p>
<p class="mt-6 text-center text-sm text-muted-foreground"><strong>DINI & CIA. TECNOLOGIA LTDA</strong><br/>CNPJ: 64.159.447/0001-90<br/>São Paulo, March 22, 2026.<br/><em>Version 1.0 — Last updated: 03/22/2026</em></p>`,
      es: `<p>18.1. Esta Política se rige por la legislación brasileña: LGPD, Constitución Federal, Marco Civil da Internet, CDC.</p>
<p>18.3. Todas las actividades de tratamiento observan los principios del Art. 6 de la LGPD.</p>
<p class="mt-6 text-center text-sm text-muted-foreground"><strong>DINI & CIA. TECNOLOGIA LTDA</strong><br/>CNPJ: 64.159.447/0001-90<br/>São Paulo, 22 de marzo de 2026.<br/><em>Versión 1.0 — Última actualización: 22/03/2026</em></p>`,
    },
  },
];
