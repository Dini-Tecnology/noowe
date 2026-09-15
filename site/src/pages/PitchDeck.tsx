import { useState, useEffect, useCallback } from "react";
import SEOHead from "@/components/seo/SEOHead";
import { 
  ChevronLeft, 
  ChevronRight, 
  Utensils, 
  Users, 
  TrendingUp, 
  Heart,
  Sparkles,
  Target,
  Zap,
  Shield,
  Award,
  Clock,
  MapPin,
  CreditCard,
  Bell,
  Star,
  BarChart3,
  Smartphone,
  Globe,
  Layers,
  CheckCircle2,
  ArrowRight,
  Download,
  Presentation,
  Building2,
  DollarSign,
  PieChart,
  Rocket,
  Brain,
  Lightbulb,
  Menu,
  X
} from "lucide-react";

// ========================================
// SLIDE DATA
// ========================================

interface Slide {
  id: string;
  type: 'cover' | 'problem' | 'solution' | 'features' | 'tech' | 'market' | 'business' | 'traction' | 'team' | 'vision' | 'restaurant' | 'consumer' | 'habits' | 'investment' | 'cta';
  title: string;
  subtitle?: string;
}

const slides: Slide[] = [
  { id: 'cover', type: 'cover', title: 'Okinawa', subtitle: 'Transformando Experiencias Gastronomicas' },
  { id: 'problem', type: 'problem', title: 'O Problema', subtitle: 'Uma industria fragmentada' },
  { id: 'solution', type: 'solution', title: 'A Solucao', subtitle: 'Okinawa Experience Platform' },
  { id: 'consumer', type: 'consumer', title: 'Para o Consumidor', subtitle: 'Experiencias memoraveis' },
  { id: 'restaurant', type: 'restaurant', title: 'Para o Restaurante', subtitle: 'Tecnologia que impulsiona' },
  { id: 'habits', type: 'habits', title: 'Formacao de Habitos', subtitle: 'Ciencia por tras da fidelizacao' },
  { id: 'features', type: 'features', title: 'Diferenciais', subtitle: 'Inovacao em cada detalhe' },
  { id: 'tech', type: 'tech', title: 'Tecnologia', subtitle: 'Arquitetura de classe mundial' },
  { id: 'market', type: 'market', title: 'Mercado', subtitle: 'Oportunidade massiva' },
  { id: 'business', type: 'business', title: 'Modelo de Negocio', subtitle: 'Receita recorrente e escalavel' },
  { id: 'traction', type: 'traction', title: 'Tracao', subtitle: 'Metricas e marcos' },
  { id: 'vision', type: 'vision', title: 'Visao', subtitle: 'O futuro da gastronomia' },
  { id: 'investment', type: 'investment', title: 'Investimento', subtitle: 'Oportunidade de crescimento' },
  { id: 'cta', type: 'cta', title: 'Vamos Juntos', subtitle: 'Proximos passos' },
];

// ========================================
// SLIDE COMPONENTS
// ========================================

const CoverSlide = () => (
  <div className="h-full flex flex-col items-center justify-center text-center relative overflow-hidden">
    {/* Background Pattern */}
    <div className="absolute inset-0 opacity-5">
      <div className="absolute top-20 left-20 w-40 h-40 rounded-full bg-primary blur-3xl" />
      <div className="absolute bottom-20 right-20 w-60 h-60 rounded-full bg-secondary blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-accent blur-3xl" />
    </div>
    
    {/* Logo */}
    <div className="relative z-10 mb-8">
      <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center glow-primary">
        <Utensils className="w-16 h-16 text-primary-foreground" />
      </div>
    </div>
    
    {/* Title */}
    <h1 className="text-7xl md:text-8xl font-bold text-gradient-primary mb-4 relative z-10">
      Okinawa
    </h1>
    
    <p className="text-2xl md:text-3xl text-muted-foreground mb-8 relative z-10">
      Experience Platform
    </p>
    
    <div className="flex items-center gap-4 text-lg text-foreground/70 relative z-10">
      <span className="px-4 py-2 rounded-full bg-primary/10 text-primary font-medium">
        Gastronomia
      </span>
      <span className="px-4 py-2 rounded-full bg-secondary/10 text-secondary font-medium">
        Tecnologia
      </span>
      <span className="px-4 py-2 rounded-full bg-accent/10 text-accent-foreground font-medium">
        Experiencia
      </span>
    </div>
    
    <p className="mt-12 text-muted-foreground text-sm relative z-10">
      Pitch Deck - Janeiro 2025
    </p>
  </div>
);

const ProblemSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <h2 className="text-4xl md:text-5xl font-bold mb-12 text-gradient-primary">
      Uma industria de R$500bi fragmentada
    </h2>
    
    <div className="grid md:grid-cols-2 gap-8">
      {/* Consumer Problems */}
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-primary flex items-center gap-2">
          <Users className="w-5 h-5" />
          Dores do Consumidor
        </h3>
        {[
          { icon: Clock, text: "Tempo perdido escolhendo onde comer" },
          { icon: Target, text: "Falta de recomendacoes personalizadas" },
          { icon: CreditCard, text: "Pagamentos fragmentados e complicados" },
          { icon: Users, text: "Dificuldade em dividir contas em grupo" },
          { icon: Heart, text: "Experiencias genericas, sem conexao emocional" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <item.icon className="w-5 h-5 text-destructive" />
            </div>
            <p className="text-foreground">{item.text}</p>
          </div>
        ))}
      </div>
      
      {/* Restaurant Problems */}
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-secondary flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Dores do Restaurante
        </h3>
        {[
          { icon: TrendingUp, text: "Dependencia de descontos para atrair clientes" },
          { icon: BarChart3, text: "Falta de dados acionaveis sobre clientes" },
          { icon: Zap, text: "Operacoes manuais e ineficientes" },
          { icon: Users, text: "Dificuldade em fidelizar e reter clientes" },
          { icon: DollarSign, text: "Margens comprimidas por marketplaces" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:border-secondary/30 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <item.icon className="w-5 h-5 text-destructive" />
            </div>
            <p className="text-foreground">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const SolutionSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <div className="text-center mb-12">
      <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gradient-hero">
        Okinawa Experience Platform
      </h2>
      <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
        Uma plataforma que transforma a relacao entre pessoas e restaurantes, 
        criando experiencias memoraveis atraves de tecnologia e design centrado no usuario.
      </p>
    </div>
    
    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
      {[
        {
          icon: Brain,
          title: "Mediador de Decisoes",
          description: "Ajudamos usuarios a descobrir, decidir e viver experiencias gastronomicas com prazer e confianca.",
          color: "primary"
        },
        {
          icon: Sparkles,
          title: "Organizador de Experiencias",
          description: "Transformamos refeicoes em rituais significativos, celebracoes e momentos de conexao social.",
          color: "secondary"
        },
        {
          icon: Rocket,
          title: "Parceiro Estrategico",
          description: "Oferecemos aos restaurantes ferramentas para criar relacionamentos, nao apenas transacoes.",
          color: "accent"
        },
      ].map((item, i) => (
        <div key={i} className={`p-8 rounded-2xl bg-card border border-border hover-lift text-center`}>
          <div className={`w-16 h-16 rounded-2xl bg-${item.color}/10 flex items-center justify-center mx-auto mb-6`}>
            <item.icon className={`w-8 h-8 text-${item.color}`} />
          </div>
          <h3 className="text-xl font-bold mb-3">{item.title}</h3>
          <p className="text-muted-foreground">{item.description}</p>
        </div>
      ))}
    </div>
    
    <div className="mt-12 text-center">
      <p className="text-lg text-primary font-semibold">
        "Nao criamos um app de pedidos. Criamos um criador de rituais sociais e emocionais."
      </p>
    </div>
  </div>
);

const ConsumerSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gradient-primary">
      App do Consumidor
    </h2>
    <p className="text-xl text-muted-foreground mb-12">
      Experiencias gastronomicas que se tornam parte da identidade do usuario
    </p>
    
    <div className="grid md:grid-cols-4 gap-6">
      {[
        { icon: MapPin, title: "Descoberta Inteligente", desc: "Recomendacoes baseadas em contexto, humor e preferencias" },
        { icon: Smartphone, title: "QR Code & Check-in", desc: "Associacao instantanea a mesa via QR" },
        { icon: Bell, title: "Chamar Garcom", desc: "Atendimento discreto e eficiente" },
        { icon: Utensils, title: "Cardapio Interativo", desc: "Menu com fotos, harmonizacoes e AI Pairing" },
        { icon: Users, title: "Convidar Amigos", desc: "Sistema de convite para reservas em grupo" },
        { icon: CreditCard, title: "Split Payment", desc: "4 modos de divisao de conta flexiveis" },
        { icon: Star, title: "Fidelidade & Badges", desc: "Programa de pontos com identidade evolutiva" },
        { icon: Heart, title: "Rituais Pessoais", desc: '"Almoco de quinta", "Date night mensal"' },
      ].map((item, i) => (
        <div key={i} className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all hover:-translate-y-1">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <item.icon className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold mb-2">{item.title}</h3>
          <p className="text-sm text-muted-foreground">{item.desc}</p>
        </div>
      ))}
    </div>
  </div>
);

const RestaurantSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gradient-primary">
      App do Restaurante
    </h2>
    <p className="text-xl text-muted-foreground mb-12">
      Ferramentas poderosas para operacao e fidelizacao
    </p>
    
    <div className="grid md:grid-cols-4 gap-6">
      {[
        { icon: BarChart3, title: "Dashboard Real-time", desc: "Metricas ao vivo, vendas, ocupacao" },
        { icon: Layers, title: "KDS Cozinha & Bar", desc: "Display de pedidos com prioridade inteligente" },
        { icon: MapPin, title: "Gestao de Salao", desc: "Planta interativa com drag-and-drop" },
        { icon: Clock, title: "Reservas & Fila", desc: "Calendario e fila virtual integrados" },
        { icon: Users, title: "Gestao de Equipe", desc: "RH, escalas e distribuicao de gorjetas" },
        { icon: TrendingUp, title: "Analytics Acionaveis", desc: "Insights para tomada de decisao" },
        { icon: Award, title: "Loyalty Customizado", desc: "Programa de fidelidade proprio" },
        { icon: Zap, title: "8 Tipos de Servico", desc: "Full-Service, Fast Casual, Drive-Thru..." },
      ].map((item, i) => (
        <div key={i} className="p-6 rounded-2xl bg-card border border-border hover:border-secondary/30 transition-all hover:-translate-y-1">
          <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
            <item.icon className="w-6 h-6 text-secondary" />
          </div>
          <h3 className="font-semibold mb-2">{item.title}</h3>
          <p className="text-sm text-muted-foreground">{item.desc}</p>
        </div>
      ))}
    </div>
  </div>
);

const HabitsSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <div className="text-center mb-10">
      <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gradient-hero">
        Ciencia da Formacao de Habitos
      </h2>
      <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
        Aplicamos frameworks de "Hooked" e "Atomic Habits" para criar uma experiencia que se torna parte da rotina emocional dos usuarios
      </p>
    </div>
    
    {/* Hooked Loop */}
    <div className="grid md:grid-cols-4 gap-6 mb-10">
      {[
        { 
          step: "1", 
          title: "Gatilho", 
          desc: "Notificacoes contextuais: clima, horario, humor, ocasiao",
          example: '"Choveu - dia perfeito para comfort food"'
        },
        { 
          step: "2", 
          title: "Acao", 
          desc: "Interface absurdamente simples: 1-3 sugestoes claras",
          example: '"Um gesto: salvar, reservar, pedir"'
        },
        { 
          step: "3", 
          title: "Recompensa", 
          desc: "Descobertas, status social, alivio da decisao",
          example: '"Voce descobriu uma joia escondida!"'
        },
        { 
          step: "4", 
          title: "Investimento", 
          desc: "Cada uso deixa rastro: preferencias, favoritos, rituais",
          example: '"Seu perfil gastronomico evoluindo"'
        },
      ].map((item, i) => (
        <div key={i} className="relative p-6 rounded-2xl bg-card border border-border">
          <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
            {item.step}
          </div>
          <h3 className="font-bold text-lg mb-2 mt-2">{item.title}</h3>
          <p className="text-muted-foreground text-sm mb-3">{item.desc}</p>
          <p className="text-xs text-primary italic">{item.example}</p>
        </div>
      ))}
    </div>
    
    {/* Key Insight */}
    <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-2xl p-8 text-center">
      <Lightbulb className="w-10 h-10 text-primary mx-auto mb-4" />
      <p className="text-xl font-semibold mb-2">O objetivo nao e viciar - e se tornar parte da rotina emocional</p>
      <p className="text-muted-foreground">
        "Sempre que pensar em comer fora ou viver uma experiencia gastronomica, Okinawa vem automaticamente a mente"
      </p>
    </div>
  </div>
);

const FeaturesSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <h2 className="text-4xl md:text-5xl font-bold mb-12 text-center text-gradient-primary">
      Diferenciais Competitivos
    </h2>
    
    <div className="grid md:grid-cols-3 gap-8">
      {[
        {
          title: "100% In-Person",
          desc: "Foco exclusivo em experiencias presenciais, sem delivery. Toda a jornada e otimizada para o momento no restaurante.",
          icon: MapPin,
          tag: "Filosofia"
        },
        {
          title: "Split Payment Inteligente",
          desc: "4 modos de divisao: individual, igual, por item, ou valor fixo. Suporta grupos mistos (com e sem app).",
          icon: CreditCard,
          tag: "Pagamento"
        },
        {
          title: "AI Pairing Assistant",
          desc: "Sugestoes de harmonizacao entre pratos e bebidas baseadas em IA e preferencias do usuario.",
          icon: Brain,
          tag: "Inteligencia"
        },
        {
          title: "8 Tipos de Servico",
          desc: "Full-Service, Quick Service, Fast Casual, Cafe, Buffet, Drive-Thru, Food Truck, Chef's Table.",
          icon: Layers,
          tag: "Flexibilidade"
        },
        {
          title: "Gastronome Profiles",
          desc: "Sistema de identidade que evolui o usuario de 'cliente' para 'explorador', 'conhecedor', 'anfitriao'.",
          icon: Award,
          tag: "Identidade"
        },
        {
          title: "Ritual Engine",
          desc: "Deteccao automatica de padroes: 'Almoco de quinta com equipe', 'Date night mensal', 'Brunch de domingo'.",
          icon: Heart,
          tag: "Habitos"
        },
      ].map((item, i) => (
        <div key={i} className="p-6 rounded-2xl bg-card border border-border hover-lift">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <item.icon className="w-6 h-6 text-primary" />
            </div>
            <span className="px-3 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-medium">
              {item.tag}
            </span>
          </div>
          <h3 className="text-lg font-bold mb-2">{item.title}</h3>
          <p className="text-muted-foreground text-sm">{item.desc}</p>
        </div>
      ))}
    </div>
  </div>
);

const TechSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <h2 className="text-4xl md:text-5xl font-bold mb-12 text-center text-gradient-primary">
      Arquitetura de Classe Mundial
    </h2>
    
    <div className="grid md:grid-cols-2 gap-12">
      {/* Tech Stack */}
      <div>
        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Stack Tecnologica
        </h3>
        <div className="space-y-4">
          {[
            { category: "Mobile", tech: "React Native + Expo 51 + TypeScript", color: "primary" },
            { category: "Backend", tech: "Supabase Auth + Postgres + RLS", color: "secondary" },
            { category: "Real-time", tech: "Supabase Realtime + WebSocket", color: "accent" },
            { category: "Design System", tech: "Modern Chic + Glassmorphism + Haptics", color: "primary" },
            { category: "Testing", tech: "Vitest + MSW + 850+ testes (95% coverage)", color: "secondary" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
              <span className={`text-${item.color} font-semibold min-w-[100px]`}>{item.category}</span>
              <span className="text-muted-foreground">{item.tech}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Architecture Numbers */}
      <div>
        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-secondary" />
          Numeros da Arquitetura
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { number: "25", label: "Modulos Backend" },
            { number: "49", label: "Telas Mobile" },
            { number: "16", label: "Componentes Shared" },
            { number: "850+", label: "Testes Automatizados" },
            { number: "95%", label: "Code Coverage" },
            { number: "8", label: "Tipos de Servico" },
          ].map((item, i) => (
            <div key={i} className="p-6 rounded-xl bg-gradient-to-br from-primary/5 to-secondary/5 border border-border text-center">
              <p className="text-3xl font-bold text-primary mb-1">{item.number}</p>
              <p className="text-sm text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const MarketSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <h2 className="text-4xl md:text-5xl font-bold mb-12 text-center text-gradient-primary">
      Oportunidade de Mercado
    </h2>
    
    <div className="grid md:grid-cols-3 gap-8 mb-12">
      {[
        { value: "R$ 500bi", label: "Mercado de Food Service Brasil", sub: "TAM - Total Addressable Market" },
        { value: "R$ 80bi", label: "Segmento Full-Service + Fast Casual", sub: "SAM - Serviceable Available Market" },
        { value: "R$ 5bi", label: "Mercado Inicial Target", sub: "SOM - Serviceable Obtainable Market" },
      ].map((item, i) => (
        <div key={i} className="p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent border border-border text-center">
          <p className="text-4xl md:text-5xl font-bold text-primary mb-2">{item.value}</p>
          <p className="text-lg font-semibold mb-1">{item.label}</p>
          <p className="text-sm text-muted-foreground">{item.sub}</p>
        </div>
      ))}
    </div>
    
    <div className="grid md:grid-cols-2 gap-8">
      <div className="p-6 rounded-2xl bg-card border border-border">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Tendencias a Favor
        </h3>
        <ul className="space-y-3">
          {[
            "Digitalizacao acelerada pos-pandemia",
            "Demanda por experiencias personalizadas",
            "Crescimento de pagamentos digitais",
            "Consumidores buscando conexao emocional",
            "Restaurantes querendo independencia de marketplaces",
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
              <span className="text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="p-6 rounded-2xl bg-card border border-border">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-secondary" />
          Competicao Fragmentada
        </h3>
        <ul className="space-y-3">
          {[
            "iFood/Rappi: focados em delivery, nao experiencia",
            "Toast/Stone: focados em POS, nao consumidor",
            "TheFork: reservas apenas, sem jornada completa",
            "Apps proprios: caros e sem escala",
            "Ninguem unifica consumidor + restaurante + experiencia",
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-3">
              <ArrowRight className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);

const BusinessSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <h2 className="text-4xl md:text-5xl font-bold mb-12 text-center text-gradient-primary">
      Modelo de Negocio
    </h2>
    
    <div className="grid md:grid-cols-2 gap-8 mb-12">
      {/* Revenue Streams */}
      <div className="p-8 rounded-2xl bg-card border border-border">
        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-primary" />
          Fontes de Receita
        </h3>
        <div className="space-y-4">
          {[
            { source: "Assinatura Restaurante", desc: "SaaS mensal por tipo de servico", value: "R$ 299-999/mes" },
            { source: "Taxa por Transacao", desc: "% sobre pagamentos processados", value: "1.5-2.5%" },
            { source: "Premium Features", desc: "AI Pairing, Analytics avancado", value: "Add-ons" },
            { source: "Marketplace Experiencias", desc: "Eventos, degustacoes, cursos", value: "Comissao" },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <p className="font-semibold">{item.source}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
              <span className="text-primary font-semibold">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Unit Economics */}
      <div className="p-8 rounded-2xl bg-card border border-border">
        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <PieChart className="w-6 h-6 text-secondary" />
          Unit Economics Projetado
        </h3>
        <div className="space-y-4">
          {[
            { metric: "CAC Restaurante", value: "R$ 500", desc: "Custo aquisicao cliente" },
            { metric: "LTV Restaurante", value: "R$ 12.000", desc: "Lifetime value 24 meses" },
            { metric: "LTV/CAC Ratio", value: "24x", desc: "Saudavel acima de 3x" },
            { metric: "Payback Period", value: "2 meses", desc: "Recuperacao do CAC" },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <p className="font-semibold">{item.metric}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
              <span className="text-secondary font-bold text-xl">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const TractionSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <h2 className="text-4xl md:text-5xl font-bold mb-12 text-center text-gradient-primary">
      Tracao & Marcos
    </h2>
    
    {/* Timeline */}
    <div className="relative mb-12">
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-secondary rounded-full" />
      <div className="space-y-8">
        {[
          { date: "Q4 2024", title: "Fundacao & MVP", items: ["Arquitetura definida", "Design System completo", "850+ testes automatizados"], status: "done" },
          { date: "Q1 2025", title: "Beta Privado", items: ["5 restaurantes piloto", "100 usuarios ativos", "Validacao de features"], status: "current" },
          { date: "Q2 2025", title: "Lancamento Publico", items: ["50 restaurantes", "5.000 usuarios", "Series A ready"], status: "upcoming" },
          { date: "Q4 2025", title: "Escala", items: ["500+ restaurantes", "100.000 usuarios", "Expansao geografica"], status: "upcoming" },
        ].map((item, i) => (
          <div key={i} className={`flex items-start gap-8 ${i % 2 === 0 ? 'flex-row' : 'flex-row-reverse'}`}>
            <div className={`flex-1 p-6 rounded-2xl bg-card border border-border ${i % 2 === 0 ? 'text-right' : 'text-left'}`}>
              <p className={`text-sm font-semibold mb-1 ${item.status === 'done' ? 'text-success' : item.status === 'current' ? 'text-primary' : 'text-muted-foreground'}`}>
                {item.date}
              </p>
              <h4 className="text-lg font-bold mb-2">{item.title}</h4>
              <ul className={`space-y-1 ${i % 2 === 0 ? 'text-right' : 'text-left'}`}>
                {item.items.map((subItem, j) => (
                  <li key={j} className="text-sm text-muted-foreground">{subItem}</li>
                ))}
              </ul>
            </div>
            <div className={`relative z-10 w-4 h-4 rounded-full mt-6 ${
              item.status === 'done' ? 'bg-success' : 
              item.status === 'current' ? 'bg-primary glow-primary' : 
              'bg-muted'
            }`} />
            <div className="flex-1" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const VisionSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16 text-center">
    <h2 className="text-4xl md:text-5xl font-bold mb-8 text-gradient-hero">
      Nossa Visao
    </h2>
    
    <p className="text-2xl md:text-3xl text-muted-foreground max-w-4xl mx-auto mb-12 leading-relaxed">
      Ser a plataforma de experiencias gastronomicas mais amada do mundo, 
      transformando como as pessoas descobrem, decidem e vivem momentos a mesa.
    </p>
    
    <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-12">
      {[
        { icon: Globe, title: "Expansao Regional", desc: "Sao Paulo, Rio, Belo Horizonte ate 2026" },
        { icon: Rocket, title: "Novas Verticais", desc: "Bares, cafes, experiencias exclusivas" },
        { icon: Brain, title: "AI-First", desc: "Personalizacao preditiva e proativa" },
      ].map((item, i) => (
        <div key={i} className="p-6 rounded-2xl bg-card border border-border">
          <item.icon className="w-10 h-10 text-primary mx-auto mb-4" />
          <h3 className="font-bold mb-2">{item.title}</h3>
          <p className="text-sm text-muted-foreground">{item.desc}</p>
        </div>
      ))}
    </div>
    
    <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-2xl p-8 max-w-3xl mx-auto">
      <p className="text-xl font-semibold text-primary">
        "Apps vencedores organizam a vida, nao so entregam servicos."
      </p>
    </div>
  </div>
);

const InvestmentSlide = () => (
  <div className="h-full flex flex-col justify-center px-8 md:px-16">
    <h2 className="text-4xl md:text-5xl font-bold mb-4 text-center text-gradient-primary">
      Oportunidade de Investimento
    </h2>
    <p className="text-xl text-muted-foreground text-center mb-12">
      Seed Round - Pre-Series A
    </p>
    
    <div className="grid md:grid-cols-2 gap-8 mb-12">
      {/* Ask */}
      <div className="p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/30">
        <h3 className="text-2xl font-bold mb-6">Buscamos</h3>
        <p className="text-5xl font-bold text-primary mb-4">R$ 2M</p>
        <p className="text-muted-foreground mb-6">Seed Round para 18 meses de runway</p>
        <ul className="space-y-3">
          {[
            "Lancamento publico Q2 2025",
            "Escala para 500 restaurantes",
            "Equipe de 15 pessoas",
            "Marketing de aquisicao",
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      
      {/* Use of Funds */}
      <div className="p-8 rounded-2xl bg-card border border-border">
        <h3 className="text-2xl font-bold mb-6">Uso dos Fundos</h3>
        <div className="space-y-4">
          {[
            { area: "Produto & Eng", percent: 50, value: "R$ 1M" },
            { area: "Comercial & CS", percent: 25, value: "R$ 500K" },
            { area: "Marketing", percent: 15, value: "R$ 300K" },
            { area: "Operacoes", percent: 10, value: "R$ 200K" },
          ].map((item, i) => (
            <div key={i}>
              <div className="flex justify-between mb-2">
                <span className="font-medium">{item.area}</span>
                <span className="text-primary font-semibold">{item.value}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full"
                  style={{ width: `${item.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const CTASlide = () => (
  <div className="h-full flex flex-col items-center justify-center text-center px-8">
    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-8 glow-primary">
      <Utensils className="w-12 h-12 text-primary-foreground" />
    </div>
    
    <h2 className="text-4xl md:text-6xl font-bold mb-6 text-gradient-hero">
      Vamos transformar a gastronomia juntos?
    </h2>
    
    <p className="text-xl text-muted-foreground max-w-2xl mb-12">
      Junte-se a nos nessa jornada de criar experiencias memoraveis 
      e construir o futuro da relacao entre pessoas e restaurantes.
    </p>
    
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-card border border-border">
        <Globe className="w-6 h-6 text-primary" />
        <div className="text-left">
          <p className="text-sm text-muted-foreground">Website</p>
          <p className="font-semibold">okinawa.app</p>
        </div>
      </div>
      <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-card border border-border">
        <Smartphone className="w-6 h-6 text-secondary" />
        <div className="text-left">
          <p className="text-sm text-muted-foreground">Email</p>
          <p className="font-semibold">contato@okinawa.app</p>
        </div>
      </div>
    </div>
    
    <div className="mt-16">
      <p className="text-muted-foreground">
        Okinawa - Experience Platform
      </p>
      <p className="text-sm text-muted-foreground mt-2">
        Transformando experiencias gastronomicas desde 2024
      </p>
    </div>
  </div>
);

// ========================================
// MAIN COMPONENT
// ========================================

export default function PitchDeck() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showNav, setShowNav] = useState(false);
  
  const goToSlide = useCallback((index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
      setShowNav(false);
    }
  }, []);
  
  const nextSlide = useCallback(() => {
    goToSlide(currentSlide + 1);
  }, [currentSlide, goToSlide]);
  
  const prevSlide = useCallback(() => {
    goToSlide(currentSlide - 1);
  }, [currentSlide, goToSlide]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
      } else if (e.key === 'Escape') {
        setShowNav(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSlide, prevSlide]);
  
  const renderSlide = () => {
    switch (slides[currentSlide].type) {
      case 'cover': return <CoverSlide />;
      case 'problem': return <ProblemSlide />;
      case 'solution': return <SolutionSlide />;
      case 'consumer': return <ConsumerSlide />;
      case 'restaurant': return <RestaurantSlide />;
      case 'habits': return <HabitsSlide />;
      case 'features': return <FeaturesSlide />;
      case 'tech': return <TechSlide />;
      case 'market': return <MarketSlide />;
      case 'business': return <BusinessSlide />;
      case 'traction': return <TractionSlide />;
      case 'vision': return <VisionSlide />;
      case 'investment': return <InvestmentSlide />;
      case 'cta': return <CTASlide />;
      default: return <CoverSlide />;
    }
  };
  
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <SEOHead
        title="Pitch Deck"
        description="Okinawa Experience Platform — Pitch Deck completo com visão, problema, solução, mercado, modelo de negócio e tração."
        canonical="/pitch"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "PresentationDigitalDocument",
          name: "Okinawa Pitch Deck",
          description: "Pitch Deck da plataforma Okinawa para experiências gastronômicas.",
        }}
      />
      {/* Navigation Menu */}
      {showNav && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl">
          <div className="absolute top-4 right-4">
            <button 
              onClick={() => setShowNav(false)}
              className="p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="h-full flex items-center justify-center">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-8 max-w-5xl">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  onClick={() => goToSlide(index)}
                  className={`p-6 rounded-2xl border transition-all text-left ${
                    currentSlide === index 
                      ? 'bg-primary text-primary-foreground border-primary' 
                      : 'bg-card border-border hover:border-primary/50'
                  }`}
                >
                  <span className="text-sm opacity-70">{index + 1}</span>
                  <h4 className="font-semibold mt-1">{slide.title}</h4>
                  {slide.subtitle && (
                    <p className={`text-xs mt-1 ${currentSlide === index ? 'opacity-80' : 'text-muted-foreground'}`}>
                      {slide.subtitle}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-40 p-4 flex items-center justify-between bg-background/80 backdrop-blur-xl border-b border-border">
        <button
          onClick={() => setShowNav(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <Menu className="w-5 h-5" />
          <span className="hidden md:inline">Menu</span>
        </button>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-muted">
            <Presentation className="w-5 h-5 text-primary" />
            <span className="font-medium">{currentSlide + 1} / {slides.length}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Download className="w-5 h-5" />
            <span className="hidden md:inline">Exportar PDF</span>
          </button>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="fixed top-16 left-0 right-0 z-30 h-1 bg-muted">
        <div 
          className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
          style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
        />
      </div>
      
      {/* Slide Content */}
      <div className="pt-20 min-h-screen">
        {renderSlide()}
      </div>
      
      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        disabled={currentSlide === 0}
        className={`fixed left-4 top-1/2 -translate-y-1/2 z-40 p-4 rounded-full bg-card border border-border shadow-lg transition-all ${
          currentSlide === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-muted hover:border-primary/50'
        }`}
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      
      <button
        onClick={nextSlide}
        disabled={currentSlide === slides.length - 1}
        className={`fixed right-4 top-1/2 -translate-y-1/2 z-40 p-4 rounded-full bg-card border border-border shadow-lg transition-all ${
          currentSlide === slides.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-muted hover:border-primary/50'
        }`}
      >
        <ChevronRight className="w-6 h-6" />
      </button>
      
      {/* Bottom Navigation Dots */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 p-2 rounded-full bg-card border border-border shadow-lg">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`h-2 rounded-full transition-all ${
              currentSlide === index
                ? 'w-8 bg-primary'
                : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>
      
      {/* Keyboard Hint */}
      <div className="fixed bottom-6 right-6 z-40 hidden md:flex items-center gap-2 text-sm text-muted-foreground">
        <span className="px-2 py-1 rounded bg-muted font-mono text-xs">←</span>
        <span className="px-2 py-1 rounded bg-muted font-mono text-xs">→</span>
        <span>para navegar</span>
      </div>
    </div>
  );
}
