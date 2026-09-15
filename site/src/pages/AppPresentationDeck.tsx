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
  Menu,
  X,
  QrCode,
  ChefHat,
  Wallet,
  Calendar,
  MessageSquare,
  Brain,
  Split,
  Gift,
  Eye,
  Lock,
  Lightbulb,
  Play,
  Store,
  Handshake
} from "lucide-react";

// ========================================
// SLIDE DATA - App Presentation Focus
// ========================================

interface Slide {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
}

const slides: Slide[] = [
  { id: 'cover', type: 'cover', title: 'Okinawa', subtitle: 'A Plataforma que Transforma Experiências Gastronômicas' },
  { id: 'why', type: 'why', title: 'Por Que Okinawa?', subtitle: 'O problema que resolvemos' },
  { id: 'ecosystem', type: 'ecosystem', title: 'O Ecossistema', subtitle: 'Dois apps, uma experiência completa' },
  { id: 'client-app', type: 'client-app', title: 'App do Cliente', subtitle: 'Experiências memoráveis na palma da mão' },
  { id: 'client-features', type: 'client-features', title: 'Features do Cliente', subtitle: 'Tudo que o consumidor precisa' },
  { id: 'restaurant-app', type: 'restaurant-app', title: 'App do Restaurante', subtitle: 'Operação inteligente e eficiente' },
  { id: 'restaurant-features', type: 'restaurant-features', title: 'Features do Restaurante', subtitle: 'Ferramentas poderosas para gestão' },
  { id: 'service-types', type: 'service-types', title: '8 Tipos de Serviço', subtitle: 'Flexibilidade para qualquer operação' },
  { id: 'differentials', type: 'differentials', title: 'Diferenciais', subtitle: 'O que nos torna únicos' },
  { id: 'tech-excellence', type: 'tech-excellence', title: 'Excelência Técnica', subtitle: 'Qualidade de classe mundial' },
  { id: 'cta', type: 'cta', title: 'Vamos Juntos', subtitle: 'Transforme sua experiência gastronômica' },
];

// ========================================
// SLIDE COMPONENTS
// ========================================

const CoverSlide = () => (
  <div className="h-full flex flex-col items-center justify-center text-center relative overflow-hidden">
    {/* Animated Background */}
    <div className="absolute inset-0 opacity-10">
      <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-primary animate-pulse" style={{ animationDuration: '3s' }} />
      <div className="absolute top-1/3 right-20 w-40 h-40 rounded-full bg-secondary animate-pulse" style={{ animationDuration: '4s', animationDelay: '1s' }} />
      <div className="absolute bottom-20 left-1/4 w-48 h-48 rounded-full bg-accent animate-pulse" style={{ animationDuration: '5s', animationDelay: '2s' }} />
      <div className="absolute bottom-10 right-1/3 w-36 h-36 rounded-full bg-primary animate-pulse" style={{ animationDuration: '3.5s', animationDelay: '0.5s' }} />
    </div>
    
    {/* Logo */}
    <div className="relative z-10 mb-6">
      <div className="w-28 h-28 md:w-36 md:h-36 rounded-3xl bg-gradient-to-br from-primary via-primary to-orange-700 flex items-center justify-center shadow-2xl" style={{ boxShadow: '0 25px 60px -12px hsl(var(--primary) / 0.4)' }}>
        <Utensils className="w-14 h-14 md:w-18 md:h-18 text-primary-foreground" />
      </div>
    </div>
    
    {/* Title */}
    <h1 className="text-6xl md:text-8xl font-bold bg-gradient-to-r from-primary via-orange-500 to-primary bg-clip-text text-transparent mb-3 relative z-10">
      Okinawa
    </h1>
    
    <p className="text-xl md:text-2xl text-muted-foreground mb-6 relative z-10 font-light">
      Experience Platform
    </p>
    
    <p className="text-lg md:text-xl text-foreground/80 max-w-2xl mb-10 relative z-10 leading-relaxed px-4">
      A plataforma que conecta pessoas e restaurantes através de 
      <span className="text-primary font-semibold"> experiências gastronômicas memoráveis</span>
    </p>
    
    {/* App Badges */}
    <div className="flex flex-col md:flex-row items-center gap-4 relative z-10">
      <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
        <Smartphone className="w-5 h-5 text-primary" />
        <span className="text-foreground font-medium">App Cliente</span>
      </div>
      <div className="hidden md:block text-muted-foreground">+</div>
      <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-secondary/10 to-secondary/5 border border-secondary/20">
        <Store className="w-5 h-5 text-secondary" />
        <span className="text-foreground font-medium">App Restaurante</span>
      </div>
    </div>
    
    {/* Scroll hint */}
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground animate-bounce">
      <span className="text-sm">Deslize para explorar</span>
      <ChevronRight className="w-5 h-5 rotate-90" />
    </div>
  </div>
);

const WhySlide = () => (
  <div className="h-full flex flex-col justify-center px-6 md:px-16">
    <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-orange-600 bg-clip-text text-transparent">
      Por Que Okinawa?
    </h2>
    <p className="text-lg text-muted-foreground mb-10 max-w-2xl">
      Identificamos dores reais em ambos os lados da experiência gastronômica
    </p>
    
    <div className="grid md:grid-cols-2 gap-6 md:gap-10">
      {/* Consumer Pains */}
      <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-red-500/5 to-transparent border border-red-500/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-foreground">O Cliente Sofre Com...</h3>
        </div>
        <div className="space-y-4">
          {[
            { icon: Clock, text: "Tempo perdido decidindo onde comer" },
            { icon: Target, text: "Recomendações genéricas que não conectam" },
            { icon: CreditCard, text: "Pagamentos fragmentados e complicados" },
            { icon: Users, text: "Dificuldade em dividir conta com amigos" },
            { icon: Heart, text: "Experiências sem personalização" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-card/50 border border-border/50 hover:bg-card transition-colors">
              <item.icon className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-foreground/80 text-sm md:text-base">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
      
      {/* Restaurant Pains */}
      <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-amber-500/5 to-transparent border border-amber-500/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <Store className="w-6 h-6 text-amber-500" />
          </div>
          <h3 className="text-xl font-bold text-foreground">O Restaurante Sofre Com...</h3>
        </div>
        <div className="space-y-4">
          {[
            { icon: TrendingUp, text: "Dependência de descontos para atrair clientes" },
            { icon: BarChart3, text: "Falta de dados sobre comportamento do cliente" },
            { icon: Zap, text: "Operações manuais e ineficientes" },
            { icon: Users, text: "Dificuldade em fidelizar clientes" },
            { icon: Wallet, text: "Margens comprimidas por marketplaces" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-card/50 border border-border/50 hover:bg-card transition-colors">
              <item.icon className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <p className="text-foreground/80 text-sm md:text-base">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
    
    {/* Solution hint */}
    <div className="mt-8 text-center">
      <p className="text-primary font-semibold text-lg flex items-center justify-center gap-2">
        <Lightbulb className="w-5 h-5" />
        Okinawa resolve tudo isso em uma única plataforma
      </p>
    </div>
  </div>
);

const EcosystemSlide = () => (
  <div className="h-full flex flex-col justify-center px-6 md:px-16">
    <div className="text-center mb-10">
      <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
        O Ecossistema Okinawa
      </h2>
      <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
        Dois aplicativos nativos que trabalham em perfeita sincronia para criar experiências únicas
      </p>
    </div>
    
    <div className="grid md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto">
      {/* Client App */}
      <div className="group relative p-8 rounded-3xl bg-gradient-to-br from-primary/10 via-card to-card border border-primary/20 hover:border-primary/40 transition-all duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
        <div className="relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center mb-6 shadow-lg" style={{ boxShadow: '0 10px 30px -10px hsl(var(--primary) / 0.4)' }}>
            <Smartphone className="w-8 h-8 text-primary-foreground" />
          </div>
          <h3 className="text-2xl font-bold mb-3 text-foreground">Noowe</h3>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            App para consumidores descobrirem restaurantes, fazerem pedidos, reservas e vivenciarem experiências gastronômicas memoráveis.
          </p>
          <div className="flex flex-wrap gap-2">
            {['Descoberta', 'Pedidos', 'Reservas', 'Pagamentos', 'Fidelidade'].map((tag) => (
              <span key={tag} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      
      {/* Restaurant App */}
      <div className="group relative p-8 rounded-3xl bg-gradient-to-br from-secondary/10 via-card to-card border border-secondary/20 hover:border-secondary/40 transition-all duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 rounded-full blur-3xl group-hover:bg-secondary/10 transition-colors" />
        <div className="relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-secondary to-teal-600 flex items-center justify-center mb-6 shadow-lg" style={{ boxShadow: '0 10px 30px -10px hsl(var(--secondary) / 0.4)' }}>
            <Store className="w-8 h-8 text-secondary-foreground" />
          </div>
          <h3 className="text-2xl font-bold mb-3 text-foreground">Okinawa Restaurante</h3>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            App para gestores operarem com eficiência, visualizarem dados em tempo real e criarem relacionamentos duradouros com clientes.
          </p>
          <div className="flex flex-wrap gap-2">
            {['Dashboard', 'KDS', 'Mesas', 'Equipe', 'Analytics'].map((tag) => (
              <span key={tag} className="px-3 py-1 rounded-full bg-secondary/10 text-secondary text-sm font-medium">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
    
    {/* Connection line */}
    <div className="flex items-center justify-center mt-8 gap-4">
      <div className="h-px w-20 bg-gradient-to-r from-transparent to-primary/30" />
      <div className="px-6 py-2 rounded-full bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
        <span className="text-sm font-medium text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Sincronização em tempo real
        </span>
      </div>
      <div className="h-px w-20 bg-gradient-to-l from-transparent to-secondary/30" />
    </div>
  </div>
);

const ClientAppSlide = () => (
  <div className="h-full flex flex-col justify-center px-6 md:px-16">
    <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16">
      {/* Phone Mockup */}
      <div className="flex-shrink-0">
        <div className="relative">
          {/* Phone frame */}
          <div className="w-64 h-[520px] rounded-[3rem] bg-gradient-to-b from-zinc-800 to-zinc-900 p-3 shadow-2xl">
            <div className="w-full h-full rounded-[2.5rem] bg-gradient-to-br from-primary/20 via-background to-background border border-border overflow-hidden relative">
              {/* Status bar */}
              <div className="absolute top-0 left-0 right-0 h-8 bg-background/80 backdrop-blur flex items-center justify-center">
                <div className="w-20 h-5 bg-foreground/10 rounded-full" />
              </div>
              {/* Content */}
              <div className="pt-10 px-4 space-y-3">
                <div className="h-12 rounded-xl bg-primary/10 flex items-center gap-3 px-4">
                  <MapPin className="w-5 h-5 text-primary" />
                  <span className="text-sm text-foreground/70">Onde vamos comer?</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[Utensils, Heart, Star, Clock].map((Icon, i) => (
                    <div key={i} className="h-14 rounded-xl bg-card border border-border flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                  ))}
                </div>
                <div className="h-32 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/20" />
                    <div className="flex-1 h-3 rounded bg-foreground/10" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 rounded bg-foreground/5 w-3/4" />
                    <div className="h-2 rounded bg-foreground/5 w-1/2" />
                  </div>
                </div>
                <div className="h-24 rounded-2xl bg-card border border-border p-4">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-orange-200 to-orange-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 rounded bg-foreground/10 w-3/4" />
                      <div className="h-2 rounded bg-foreground/5 w-1/2" />
                      <div className="h-4 rounded bg-primary/20 w-16" />
                    </div>
                  </div>
                </div>
              </div>
              {/* Bottom nav */}
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-background/80 backdrop-blur border-t border-border flex items-center justify-around px-6">
                {[MapPin, QrCode, Calendar, Users].map((Icon, i) => (
                  <Icon key={i} className={`w-5 h-5 ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                ))}
              </div>
            </div>
          </div>
          {/* Glow */}
          <div className="absolute -inset-4 bg-primary/10 rounded-[4rem] blur-2xl -z-10" />
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 text-center md:text-left">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
          <Smartphone className="w-4 h-4" />
          App do Cliente
        </div>
        <h2 className="text-3xl md:text-5xl font-bold mb-4 text-foreground">
          Experiências na
          <span className="bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent"> palma da mão</span>
        </h2>
        <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
          O app que transforma como as pessoas descobrem, decidem e vivem experiências gastronômicas. 
          De restaurantes favoritos a novas descobertas, tudo com um toque.
        </p>
        
        {/* Key features */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: MapPin, label: 'Descoberta Inteligente' },
            { icon: QrCode, label: 'QR Code na Mesa' },
            { icon: CreditCard, label: 'Pagamento Integrado' },
            { icon: Heart, label: 'Programa de Fidelidade' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const ClientFeaturesSlide = () => (
  <div className="h-full flex flex-col justify-center px-6 md:px-16">
    <div className="text-center mb-8">
      <h2 className="text-3xl md:text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent">
        Tudo que o Cliente Precisa
      </h2>
      <p className="text-muted-foreground">Features completas para uma experiência excepcional</p>
    </div>
    
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
      {[
        { icon: MapPin, title: 'Descoberta', desc: 'Restaurantes por localização, tipo e humor' },
        { icon: QrCode, title: 'QR Scanner', desc: 'Check-in instantâneo na mesa' },
        { icon: Utensils, title: 'Cardápio Digital', desc: 'Fotos, descrições e harmonizações' },
        { icon: Brain, title: 'AI Pairing', desc: 'Sugestões inteligentes de harmonização' },
        { icon: Bell, title: 'Chamar Garçom', desc: 'Atendimento discreto e eficiente' },
        { icon: Users, title: 'Convidar Amigos', desc: 'Reservas e pedidos em grupo' },
        { icon: Split, title: 'Split Payment', desc: '4 modos de divisão de conta' },
        { icon: Wallet, title: 'Carteira Digital', desc: 'Pagamentos e vouchers integrados' },
        { icon: Calendar, title: 'Reservas', desc: 'Agendamento com confirmação' },
        { icon: Clock, title: 'Fila Virtual', desc: 'Gerencie espera remotamente' },
        { icon: Star, title: 'Avaliações', desc: 'Feedback rápido e detalhado' },
        { icon: Award, title: 'Badges & Tiers', desc: 'Evolua seu perfil gastronômico' },
        { icon: Gift, title: 'Recompensas', desc: 'Pontos que viram benefícios' },
        { icon: Heart, title: 'Favoritos', desc: 'Salve seus lugares preferidos' },
        { icon: Eye, title: 'Histórico', desc: 'Reveja todas suas experiências' },
        { icon: Lock, title: 'Segurança', desc: 'Biometria e dados protegidos' },
      ].map((item, i) => (
        <div key={i} className="p-4 rounded-2xl bg-card border border-border hover:border-primary/30 hover:-translate-y-1 transition-all duration-200 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-3 group-hover:from-primary/30 group-hover:to-primary/10 transition-colors">
            <item.icon className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-semibold text-sm mb-1 text-foreground">{item.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
        </div>
      ))}
    </div>
  </div>
);

const RestaurantAppSlide = () => (
  <div className="h-full flex flex-col justify-center px-6 md:px-16">
    <div className="flex flex-col md:flex-row-reverse items-center gap-8 md:gap-16">
      {/* Tablet Mockup */}
      <div className="flex-shrink-0">
        <div className="relative">
          {/* Tablet frame */}
          <div className="w-80 h-[440px] rounded-3xl bg-gradient-to-b from-zinc-800 to-zinc-900 p-2 shadow-2xl">
            <div className="w-full h-full rounded-2xl bg-gradient-to-br from-secondary/10 via-background to-background border border-border overflow-hidden relative">
              {/* Header */}
              <div className="h-14 bg-background border-b border-border flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-secondary" />
                  <span className="text-sm font-semibold text-foreground">KDS - Cozinha</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-2 py-1 rounded bg-green-500/20 text-green-500 text-xs">Online</div>
                </div>
              </div>
              {/* Content */}
              <div className="p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { status: 'new', color: 'primary' },
                    { status: 'prep', color: 'amber-500' },
                    { status: 'ready', color: 'green-500' },
                  ].map((col, i) => (
                    <div key={i} className="space-y-2">
                      <div className={`h-24 rounded-xl bg-${col.color}/10 border border-${col.color}/20 p-2`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-foreground">#127</span>
                          <span className="text-[10px] text-muted-foreground">3min</span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-2 rounded bg-foreground/10 w-full" />
                          <div className="h-2 rounded bg-foreground/5 w-3/4" />
                        </div>
                      </div>
                      <div className={`h-20 rounded-xl bg-card border border-border p-2`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-foreground">#128</span>
                          <span className="text-[10px] text-muted-foreground">1min</span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-2 rounded bg-foreground/10 w-2/3" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Stats */}
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {['12', '5', '3', '28'].map((num, i) => (
                    <div key={i} className="p-2 rounded-lg bg-card border border-border text-center">
                      <p className="text-lg font-bold text-secondary">{num}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {['Pedidos', 'Preparo', 'Prontos', 'Servidos'][i]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Glow */}
          <div className="absolute -inset-4 bg-secondary/10 rounded-[3rem] blur-2xl -z-10" />
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 text-center md:text-left">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 text-secondary text-sm font-medium mb-4">
          <Store className="w-4 h-4" />
          App do Restaurante
        </div>
        <h2 className="text-3xl md:text-5xl font-bold mb-4 text-foreground">
          Operação
          <span className="bg-gradient-to-r from-secondary to-teal-500 bg-clip-text text-transparent"> inteligente</span>
        </h2>
        <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
          Ferramentas poderosas para gestores operarem com eficiência máxima. 
          Dashboard em tempo real, KDS para cozinha e bar, gestão de salão e muito mais.
        </p>
        
        {/* Key features */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: BarChart3, label: 'Dashboard Real-time' },
            { icon: ChefHat, label: 'KDS Cozinha & Bar' },
            { icon: MapPin, label: 'Gestão de Salão' },
            { icon: Users, label: 'Gestão de Equipe' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-secondary" />
              </div>
              <span className="text-sm font-medium text-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const RestaurantFeaturesSlide = () => (
  <div className="h-full flex flex-col justify-center px-6 md:px-16">
    <div className="text-center mb-8">
      <h2 className="text-3xl md:text-4xl font-bold mb-3 bg-gradient-to-r from-secondary to-teal-500 bg-clip-text text-transparent">
        Ferramentas Poderosas para Gestão
      </h2>
      <p className="text-muted-foreground">Operação eficiente e inteligência de negócio</p>
    </div>
    
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
      {[
        { icon: BarChart3, title: 'Dashboard', desc: 'Métricas ao vivo, vendas, ocupação' },
        { icon: ChefHat, title: 'KDS Cozinha', desc: 'Display de pedidos com prioridade' },
        { icon: Utensils, title: 'KDS Bar', desc: 'Gestão de bebidas sincronizada' },
        { icon: MapPin, title: 'Planta do Salão', desc: 'Drag-and-drop interativo' },
        { icon: Calendar, title: 'Reservas', desc: 'Calendário e confirmações' },
        { icon: Clock, title: 'Fila Virtual', desc: 'Gestão inteligente de espera' },
        { icon: Users, title: 'Staff', desc: 'Escalas e atribuição de mesas' },
        { icon: CreditCard, title: 'Gorjetas', desc: 'Distribuição automática' },
        { icon: TrendingUp, title: 'Analytics', desc: 'Insights acionáveis de BI' },
        { icon: MessageSquare, title: 'Avaliações', desc: 'Responda feedbacks' },
        { icon: Award, title: 'Loyalty', desc: 'Programa de fidelidade próprio' },
        { icon: Gift, title: 'Promoções', desc: 'Campanhas contextuais' },
        { icon: Bell, title: 'Alertas', desc: 'Notificações de chamados' },
        { icon: Wallet, title: 'Financeiro', desc: 'Relatórios de rentabilidade' },
        { icon: Layers, title: 'Cardápio', desc: 'Gestão completa do menu' },
        { icon: Shield, title: 'Multi-role', desc: 'Permissões por função' },
      ].map((item, i) => (
        <div key={i} className="p-4 rounded-2xl bg-card border border-border hover:border-secondary/30 hover:-translate-y-1 transition-all duration-200 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center mb-3 group-hover:from-secondary/30 group-hover:to-secondary/10 transition-colors">
            <item.icon className="w-5 h-5 text-secondary" />
          </div>
          <h3 className="font-semibold text-sm mb-1 text-foreground">{item.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
        </div>
      ))}
    </div>
  </div>
);

const ServiceTypesSlide = () => (
  <div className="h-full flex flex-col justify-center px-6 md:px-16">
    <div className="text-center mb-10">
      <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-orange-500 to-secondary bg-clip-text text-transparent">
        8 Tipos de Serviço
      </h2>
      <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
        Flexibilidade total para atender qualquer modelo de operação gastronômica
      </p>
    </div>
    
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      {[
        { 
          icon: Utensils, 
          name: 'Full-Service', 
          desc: 'Restaurante tradicional com garçom na mesa',
          color: 'primary'
        },
        { 
          icon: Zap, 
          name: 'Quick Service', 
          desc: 'Fast-food com pedido no balcão',
          color: 'orange-500'
        },
        { 
          icon: Clock, 
          name: 'Fast Casual', 
          desc: 'Híbrido: qualidade + velocidade',
          color: 'amber-500'
        },
        { 
          icon: Store, 
          name: 'Café & Bakery', 
          desc: 'Cafeterias e padarias artesanais',
          color: 'yellow-600'
        },
        { 
          icon: Layers, 
          name: 'Buffet', 
          desc: 'Self-service com pesagem ou por pessoa',
          color: 'green-500'
        },
        { 
          icon: MapPin, 
          name: 'Drive-Thru', 
          desc: 'Pedido no carro com GPS tracking',
          color: 'teal-500'
        },
        { 
          icon: Smartphone, 
          name: 'Food Truck', 
          desc: 'Móvel com localização dinâmica',
          color: 'cyan-500'
        },
        { 
          icon: Award, 
          name: "Chef's Table", 
          desc: 'Experiências exclusivas e degustações',
          color: 'secondary'
        },
      ].map((item, i) => (
        <div key={i} className="group p-6 rounded-2xl bg-card border border-border hover:shadow-lg transition-all duration-300 text-center relative overflow-hidden">
          <div className={`absolute inset-0 bg-${item.color}/5 opacity-0 group-hover:opacity-100 transition-opacity`} />
          <div className={`relative z-10 w-14 h-14 rounded-2xl bg-${item.color}/10 flex items-center justify-center mx-auto mb-4`}>
            <item.icon className={`w-7 h-7 text-${item.color}`} />
          </div>
          <h3 className="relative z-10 font-bold text-lg mb-2 text-foreground">{item.name}</h3>
          <p className="relative z-10 text-sm text-muted-foreground">{item.desc}</p>
        </div>
      ))}
    </div>
    
    <p className="text-center text-muted-foreground mt-8 text-sm">
      Cada tipo de serviço tem fluxos, interfaces e configurações específicas otimizadas
    </p>
  </div>
);

const DifferentialsSlide = () => (
  <div className="h-full flex flex-col justify-center px-6 md:px-16">
    <div className="text-center mb-10">
      <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent">
        O Que Nos Torna Únicos
      </h2>
      <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
        Diferenciais competitivos que nenhuma outra plataforma oferece
      </p>
    </div>
    
    <div className="grid md:grid-cols-3 gap-6">
      {[
        {
          icon: MapPin,
          title: '100% In-Person',
          desc: 'Foco exclusivo em experiências presenciais. Sem delivery, toda a jornada otimizada para o momento no restaurante.',
          tag: 'Filosofia'
        },
        {
          icon: Split,
          title: 'Split Payment Inteligente',
          desc: '4 modos de divisão: individual, igual, por item, ou valor fixo. Suporta grupos mistos com e sem app.',
          tag: 'Pagamento'
        },
        {
          icon: Brain,
          title: 'AI Pairing Assistant',
          desc: 'IA que sugere harmonizações perfeitas entre pratos e bebidas baseada em preferências e ocasião.',
          tag: 'Inteligência'
        },
        {
          icon: Layers,
          title: '8 Tipos de Serviço',
          desc: 'Do Full-Service ao Food Truck, cada operação tem fluxos e interfaces específicas.',
          tag: 'Flexibilidade'
        },
        {
          icon: Heart,
          title: 'Formação de Hábitos',
          desc: 'Baseado em ciência comportamental para criar rituais, não só transações.',
          tag: 'Engajamento'
        },
        {
          icon: Handshake,
          title: 'Parceiro, Não Marketplace',
          desc: 'Restaurante mantém relacionamento direto com cliente, sem intermediação predatória.',
          tag: 'Modelo'
        },
      ].map((item, i) => (
        <div key={i} className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <item.icon className="w-6 h-6 text-primary" />
            </div>
            <span className="px-3 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-medium">
              {item.tag}
            </span>
          </div>
          <h3 className="text-lg font-bold mb-2 text-foreground">{item.title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
        </div>
      ))}
    </div>
  </div>
);

const TechExcellenceSlide = () => (
  <div className="h-full flex flex-col justify-center px-6 md:px-16">
    <div className="text-center mb-10">
      <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
        Excelência Técnica
      </h2>
      <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
        Arquitetura de classe mundial para escala e confiabilidade
      </p>
    </div>
    
    <div className="grid md:grid-cols-2 gap-8 mb-8">
      {/* Tech Stack */}
      <div className="p-6 rounded-2xl bg-card border border-border">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Stack Tecnológica
        </h3>
        <div className="space-y-3">
          {[
            { label: 'Mobile', value: 'React Native + Expo 51 + TypeScript' },
            { label: 'Backend', value: 'Supabase Auth + Postgres + RLS' },
            { label: 'Real-time', value: 'Supabase Realtime + WebSocket' },
            { label: 'Design', value: 'Modern Chic + Glassmorphism + Haptics' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-muted/50">
              <span className="text-primary font-medium min-w-[80px] text-sm">{item.label}</span>
              <span className="text-muted-foreground text-sm">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Numbers */}
      <div className="p-6 rounded-2xl bg-card border border-border">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-secondary" />
          Números da Arquitetura
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { number: '56', label: 'Telas Mobile' },
            { number: '850+', label: 'Testes Automatizados' },
            { number: '95%', label: 'Code Coverage' },
            { number: '8', label: 'Tipos de Serviço' },
          ].map((item, i) => (
            <div key={i} className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-secondary/5 text-center">
              <p className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">{item.number}</p>
              <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
    
    {/* Quality badges */}
    <div className="flex flex-wrap items-center justify-center gap-4">
      {[
        { icon: Shield, text: 'Enterprise-Ready' },
        { icon: Zap, text: 'Real-time Sync' },
        { icon: Lock, text: 'Segurança LGPD' },
        { icon: Globe, text: 'Escalável Global' },
      ].map((item, i) => (
        <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border">
          <item.icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{item.text}</span>
        </div>
      ))}
    </div>
  </div>
);

const CTASlide = () => (
  <div className="h-full flex flex-col items-center justify-center text-center px-6 relative overflow-hidden">
    {/* Background */}
    <div className="absolute inset-0 opacity-5">
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-secondary blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
    </div>
    
    {/* Logo */}
    <div className="relative z-10 w-24 h-24 rounded-3xl bg-gradient-to-br from-primary via-orange-500 to-secondary flex items-center justify-center mb-8 shadow-2xl" style={{ boxShadow: '0 25px 60px -12px hsl(var(--primary) / 0.4)' }}>
      <Utensils className="w-12 h-12 text-primary-foreground" />
    </div>
    
    <h2 className="relative z-10 text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-orange-500 to-secondary bg-clip-text text-transparent leading-tight">
      Transforme Experiências Gastronômicas
    </h2>
    
    <p className="relative z-10 text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
      Seja cliente ou restaurante, Okinawa é a plataforma que conecta pessoas através de experiências memoráveis
    </p>
    
    {/* CTAs */}
    <div className="relative z-10 flex flex-col md:flex-row items-center gap-4 mb-12">
      <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-primary to-orange-600 text-primary-foreground shadow-lg cursor-pointer hover:opacity-90 transition-opacity">
        <Play className="w-5 h-5" />
        <span className="font-semibold">Ver Demo Interativa</span>
      </div>
      <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors cursor-pointer">
        <MessageSquare className="w-5 h-5 text-primary" />
        <span className="font-semibold text-foreground">Falar com Equipe</span>
      </div>
    </div>
    
    {/* Contact */}
    <div className="relative z-10 flex flex-wrap items-center justify-center gap-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Globe className="w-4 h-4" />
        <span className="text-sm">okinawa.app</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Smartphone className="w-4 h-4" />
        <span className="text-sm">contato@okinawa.app</span>
      </div>
    </div>
    
    <p className="relative z-10 mt-12 text-muted-foreground text-sm">
      Okinawa Experience Platform © 2025
    </p>
  </div>
);

// ========================================
// MAIN COMPONENT
// ========================================

export default function AppPresentationDeck() {
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
      case 'why': return <WhySlide />;
      case 'ecosystem': return <EcosystemSlide />;
      case 'client-app': return <ClientAppSlide />;
      case 'client-features': return <ClientFeaturesSlide />;
      case 'restaurant-app': return <RestaurantAppSlide />;
      case 'restaurant-features': return <RestaurantFeaturesSlide />;
      case 'service-types': return <ServiceTypesSlide />;
      case 'differentials': return <DifferentialsSlide />;
      case 'tech-excellence': return <TechExcellenceSlide />;
      case 'cta': return <CTASlide />;
      default: return <CoverSlide />;
    }
  };
  
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <SEOHead
        title="Apresentação do App"
        description="Conheça o ecossistema Okinawa: dois apps nativos para clientes e restaurantes, com features completas para experiências gastronômicas."
        canonical="/pitch/app"
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-8 max-w-4xl">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  onClick={() => goToSlide(index)}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    currentSlide === index 
                      ? 'bg-primary/10 border-primary/30' 
                      : 'bg-card border-border hover:border-primary/20'
                  }`}
                >
                  <p className="text-xs text-muted-foreground mb-1">Slide {index + 1}</p>
                  <p className="font-semibold text-sm text-foreground">{slide.title}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-b border-border">
        <button
          onClick={() => setShowNav(true)}
          className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center">
              <Utensils className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground hidden md:inline">Okinawa</span>
          </div>
          <span className="text-sm text-muted-foreground">
            App Presentation
          </span>
        </div>
        
        <div className="text-sm text-muted-foreground">
          {currentSlide + 1} / {slides.length}
        </div>
      </div>
      
      {/* Slide content */}
      <div className="pt-16 pb-20 min-h-screen">
        {renderSlide()}
      </div>
      
      {/* Navigation controls */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-t border-border">
        <button
          onClick={prevSlide}
          disabled={currentSlide === 0}
          className={`p-3 rounded-xl transition-all ${
            currentSlide === 0 
              ? 'opacity-30 cursor-not-allowed' 
              : 'bg-muted hover:bg-muted/80'
          }`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        
        {/* Dots */}
        <div className="flex items-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                currentSlide === index 
                  ? 'w-6 bg-primary' 
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
            />
          ))}
        </div>
        
        <button
          onClick={nextSlide}
          disabled={currentSlide === slides.length - 1}
          className={`p-3 rounded-xl transition-all ${
            currentSlide === slides.length - 1 
              ? 'opacity-30 cursor-not-allowed' 
              : 'bg-primary text-primary-foreground hover:opacity-90'
          }`}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
