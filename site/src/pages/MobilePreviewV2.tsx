import { useState, lazy, Suspense } from "react";
import { Smartphone, ChevronLeft, ChevronRight, Store, User, Sun, Moon } from "lucide-react";
import MobilePreviewSkeleton from "@/components/mobile-preview-v2/MobilePreviewSkeleton";
import SEOHead from "@/components/seo/SEOHead";

// Client V2 screens - Auth (lazy loaded)
const WelcomeScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/WelcomeScreenV2"));
const PhoneAuthScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/PhoneAuthScreenV2"));
const BiometricEnrollmentScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/BiometricEnrollmentScreenV2"));
const OnboardingScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/OnboardingScreenV2"));
const LoginScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/LoginScreenV2"));

// Client V2 screens - Main (lazy loaded)
const HomeScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/HomeScreenV2"));
const ExploreScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/ExploreScreenV2"));
const RestaurantDetailScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/RestaurantDetailScreenV2"));
const ReservationsScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/ReservationsScreenV2"));
const ReservationDetailScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/ReservationDetailScreenV2"));
const NewReservationScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/NewReservationScreenV2"));
const VirtualQueueScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/VirtualQueueScreenV2"));
const ProfileScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/ProfileScreenV2"));
const CartScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/CartScreenV2"));
const OrdersScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/OrdersScreenV2"));
const OrderStatusScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/OrderStatusScreenV2"));
const CheckoutScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/CheckoutScreenV2"));
const UnifiedPaymentScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/UnifiedPaymentScreenV2"));
const SharedOrderScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/SharedOrderScreenV2"));
const DigitalReceiptScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/DigitalReceiptScreenV2"));
const LoyaltyScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/LoyaltyScreenV2"));
const LoyaltyDetailScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/LoyaltyDetailScreenV2"));
const LoyaltyLeaderboardScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/LoyaltyLeaderboardScreenV2"));
const CallWaiterScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/CallWaiterScreenV2"));
const DishBuilderScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/DishBuilderScreenV2"));
const PairingAssistantScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/PairingAssistantScreenV2"));
const NotificationsScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/NotificationsScreenV2"));
const FavoritesScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/FavoritesScreenV2"));
const WalletScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/WalletScreenV2"));
const CouponsScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/CouponsScreenV2"));
const SettingsScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/SettingsScreenV2"));
const AddressesScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/AddressesScreenV2"));
const SupportScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/SupportScreenV2"));
const RatingScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/RatingScreenV2"));
const QRScannerScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/QRScannerScreenV2"));
const TrackLocationScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/TrackLocationScreenV2"));

// Restaurant V2 screens (lazy loaded)
const RestaurantLoginScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/RestaurantLoginScreenV2"));
const RestaurantPhoneAuthScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/RestaurantPhoneAuthScreenV2"));
const OwnerPreviewScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/OwnerPreviewScreenV2"));
const RestaurantOrdersScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/RestaurantOrdersScreenV2"));
const OrderPaymentTrackingScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/OrderPaymentTrackingScreenV2"));
const KitchenDisplayScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/KitchenDisplayScreenV2"));
const BarKDSScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/BarKDSScreenV2"));
const TablesScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/TablesScreenV2"));
const QRCodeGeneratorScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/QRCodeGeneratorScreenV2"));
const QRCodeBatchScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/QRCodeBatchScreenV2"));
const MaitreScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/MaitreScreenV2"));
const WaiterScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/WaiterScreenV2"));
const RoleDashboardScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/RoleDashboardScreenV2"));
const RestaurantMenuScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/RestaurantMenuScreenV2"));
const RestaurantReservationsScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/RestaurantReservationsScreenV2"));
const StaffManagementScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/StaffManagementScreenV2"));
const TipsManagementScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/TipsManagementScreenV2"));
const ServiceTypeConfigScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/ServiceTypeConfigScreenV2"));
const LoyaltyManagementScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/LoyaltyManagementScreenV2"));
const FinancialScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/FinancialScreenV2"));
const ReportsScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/ReportsScreenV2"));
const ReviewsScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/ReviewsScreenV2"));
const PromotionsScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/PromotionsScreenV2"));
const RestaurantSettingsScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/RestaurantSettingsScreenV2"));
const RestaurantSelectorScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/restaurant/RestaurantSelectorScreenV2"));

// Split Payment screens (lazy loaded)
const SplitPaymentScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/SplitPaymentScreenV2"));
const SplitByItemScreenV2 = lazy(() => import("@/components/mobile-preview-v2/screens/SplitByItemScreenV2"));

interface ScreenConfig {
  id: string;
  name: string;
  component: React.LazyExoticComponent<React.ComponentType<{ onNavigate: (screen: string) => void; onBack?: () => void }>>;
}

const clientScreens: ScreenConfig[] = [
  { id: "onboarding", name: "Onboarding", component: OnboardingScreenV2 },
  { id: "welcome", name: "Welcome", component: WelcomeScreenV2 },
  { id: "phone-auth", name: "Phone Auth", component: PhoneAuthScreenV2 },
  { id: "biometric-enrollment", name: "Biometria", component: BiometricEnrollmentScreenV2 },
  { id: "login", name: "Login (Legacy)", component: LoginScreenV2 },
  { id: "home", name: "Home", component: HomeScreenV2 },
  { id: "explore", name: "Explorar", component: ExploreScreenV2 },
  { id: "restaurant-detail", name: "Restaurante", component: RestaurantDetailScreenV2 },
  { id: "new-reservation", name: "Nova Reserva", component: NewReservationScreenV2 },
  { id: "reservations", name: "Reservas", component: ReservationsScreenV2 },
  { id: "reservation-detail", name: "Detalhe Reserva", component: ReservationDetailScreenV2 },
  { id: "virtual-queue", name: "Fila Virtual", component: VirtualQueueScreenV2 },
  { id: "qr-scanner", name: "QR Scanner", component: QRScannerScreenV2 },
  { id: "call-waiter", name: "Chamar Garçom", component: CallWaiterScreenV2 },
  { id: "dish-builder", name: "Monte seu Prato", component: DishBuilderScreenV2 },
  { id: "pairing-assistant", name: "Harmonização", component: PairingAssistantScreenV2 },
  { id: "cart", name: "Carrinho", component: CartScreenV2 },
  { id: "checkout", name: "Checkout", component: CheckoutScreenV2 },
  { id: "unified-payment", name: "💳 Pagamento Unificado", component: UnifiedPaymentScreenV2 },
  { id: "split-payment", name: "💳 Split Payment (Completo)", component: SplitPaymentScreenV2 },
  { id: "split-by-item", name: "💳 Dividir por Item", component: SplitByItemScreenV2 },
  { id: "shared-order", name: "Pedido Compartilhado", component: SharedOrderScreenV2 },
  { id: "orders", name: "Pedidos", component: OrdersScreenV2 },
  { id: "order-status", name: "Status Pedido", component: OrderStatusScreenV2 },
  { id: "digital-receipt", name: "Recibo Digital", component: DigitalReceiptScreenV2 },
  { id: "track-location", name: "Rastrear", component: TrackLocationScreenV2 },
  { id: "notifications", name: "Notificações", component: NotificationsScreenV2 },
  { id: "favorites", name: "Favoritos", component: FavoritesScreenV2 },
  { id: "wallet", name: "Carteira", component: WalletScreenV2 },
  { id: "coupons", name: "Cupons", component: CouponsScreenV2 },
  { id: "loyalty", name: "Fidelidade", component: LoyaltyScreenV2 },
  { id: "loyalty-detail", name: "Detalhe Fidelidade", component: LoyaltyDetailScreenV2 },
  { id: "loyalty-leaderboard", name: "Leaderboard", component: LoyaltyLeaderboardScreenV2 },
  { id: "rating", name: "Avaliação", component: RatingScreenV2 },
  { id: "profile", name: "Perfil", component: ProfileScreenV2 },
  { id: "settings", name: "Configurações", component: SettingsScreenV2 },
  { id: "addresses", name: "Endereços", component: AddressesScreenV2 },
  { id: "support", name: "Suporte", component: SupportScreenV2 },
];

const restaurantScreens: ScreenConfig[] = [
  { id: "login", name: "Login", component: RestaurantLoginScreenV2 },
  { id: "phone-auth", name: "Phone Auth", component: RestaurantPhoneAuthScreenV2 },
  { id: "restaurant-selector", name: "Selecionar Restaurante", component: RestaurantSelectorScreenV2 },
  { id: "dashboard", name: "Dono", component: OwnerPreviewScreenV2 },
  { id: "orders", name: "Pedidos", component: RestaurantOrdersScreenV2 },
  { id: "order-payment", name: "Pagamentos", component: OrderPaymentTrackingScreenV2 },
  { id: "kitchen-kds", name: "KDS Cozinha", component: KitchenDisplayScreenV2 },
  { id: "bar-kds", name: "KDS Bar", component: BarKDSScreenV2 },
  { id: "tables", name: "Mesas", component: TablesScreenV2 },
  { id: "qr-generator", name: "Gerar QR Code", component: QRCodeGeneratorScreenV2 },
  { id: "qr-batch", name: "QR Codes em Lote", component: QRCodeBatchScreenV2 },
  { id: "maitre", name: "Maitre", component: MaitreScreenV2 },
  { id: "waiter", name: "Garçom", component: WaiterScreenV2 },
  { id: "role-dashboard", name: "Dashboard Cargo", component: RoleDashboardScreenV2 },
  { id: "menu", name: "Cardápio", component: RestaurantMenuScreenV2 },
  { id: "reservations", name: "Reservas", component: RestaurantReservationsScreenV2 },
  { id: "staff", name: "Equipe", component: StaffManagementScreenV2 },
  { id: "tips", name: "Gorjetas", component: TipsManagementScreenV2 },
  { id: "service-type", name: "Tipo Serviço", component: ServiceTypeConfigScreenV2 },
  { id: "loyalty-mgmt", name: "Fidelidade", component: LoyaltyManagementScreenV2 },
  { id: "financial", name: "Financeiro", component: FinancialScreenV2 },
  { id: "reports", name: "Relatórios", component: ReportsScreenV2 },
  { id: "reviews", name: "Avaliações", component: ReviewsScreenV2 },
  { id: "promotions", name: "Promoções", component: PromotionsScreenV2 },
  { id: "settings", name: "Configurações", component: RestaurantSettingsScreenV2 },
];

const MobilePreviewV2Page = () => {
  const [activeApp, setActiveApp] = useState<"client" | "restaurant">("client");
  const [currentScreen, setCurrentScreen] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const screens = activeApp === "client" ? clientScreens : restaurantScreens;

  const nextScreen = () => {
    setCurrentScreen((prev) => (prev + 1) % screens.length);
  };

  const prevScreen = () => {
    setCurrentScreen((prev) => (prev - 1 + screens.length) % screens.length);
  };

  const switchApp = (app: "client" | "restaurant") => {
    setActiveApp(app);
    setCurrentScreen(0);
  };

  const handleNavigate = (screen: string) => {
    const index = screens.findIndex(s => s.id === screen);
    if (index !== -1) setCurrentScreen(index);
  };

  const handleBack = () => {
    if (currentScreen > 0) setCurrentScreen(currentScreen - 1);
  };

  const CurrentScreenComponent = screens[currentScreen].component;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'dark bg-background' : 'bg-muted'}`}>
      <SEOHead
        title="Mobile Preview V2"
        description="Preview interativo das 60 telas do app Okinawa. Navegue pelo fluxo completo de cliente e restaurante em light e dark mode."
        canonical="/mobile-v2"
        noIndex
      />
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b bg-card/80 border-border transition-colors duration-300">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow">
              <span className="font-bold text-xl text-primary-foreground">O</span>
            </div>
            <div>
              <span className="font-bold text-xl text-foreground">Okinawa</span>
              <span className="text-xs ml-2 text-muted-foreground">Preview V2</span>
            </div>
          </div>
          
          {/* App Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-muted transition-colors">
            <button
              onClick={() => switchApp("client")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                activeApp === "client" 
                  ? "bg-primary text-primary-foreground shadow-glow" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="h-4 w-4" />
              Cliente
            </button>
            <button
              onClick={() => switchApp("restaurant")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                activeApp === "restaurant" 
                  ? "bg-primary text-primary-foreground shadow-glow" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Store className="h-4 w-4" />
              Restaurante
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2.5 rounded-xl transition-all duration-300 bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              aria-label={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}
            >
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-6xl">
          {/* Screen Navigation Pills */}
          <div className="flex items-center justify-center gap-2 mb-8 flex-wrap max-h-32 overflow-y-auto py-2">
            {screens.map((screen, index) => (
              <button
                key={screen.id}
                onClick={() => setCurrentScreen(index)}
                className={`px-4 py-2 rounded-full text-xs font-medium transition-all duration-300 ${
                  currentScreen === index
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "bg-card text-muted-foreground hover:bg-card-hover hover:text-foreground border border-border"
                }`}
              >
                {screen.name}
              </button>
            ))}
          </div>

          {/* Phone Mockup */}
          <div className="flex items-center justify-center gap-8">
            <button 
              onClick={prevScreen} 
              className="p-4 rounded-2xl transition-all duration-300 bg-card hover:bg-card-hover shadow-lg border border-border"
              aria-label="Tela anterior"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Phone Frame */}
            <div className="relative">
              <div className="w-[375px] h-[812px] rounded-[55px] p-3 shadow-2xl transition-colors duration-300 bg-foreground/90">
                <div className="w-full h-full rounded-[45px] overflow-hidden relative bg-background transition-colors duration-300">
                  {/* Status Bar */}
                  <div className="absolute top-0 left-0 right-0 h-12 z-10 flex items-center justify-between px-8 pt-2 bg-background/80 backdrop-blur-sm">
                    <span className="text-sm font-semibold text-foreground">9:41</span>
                    <div className="flex items-center gap-1">
                      <div className="flex gap-0.5">
                        <div className="w-1 h-2 rounded-full bg-foreground" />
                        <div className="w-1 h-2.5 rounded-full bg-foreground" />
                        <div className="w-1 h-3 rounded-full bg-foreground" />
                        <div className="w-1 h-3.5 rounded-full bg-foreground" />
                      </div>
                      <div className="w-6 h-3 rounded-sm ml-1 bg-foreground" />
                    </div>
                  </div>

                  {/* Dynamic Island */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-7 bg-foreground rounded-full z-20" />

                  {/* Screen Content */}
                  <div className="h-full pt-12 overflow-hidden bg-muted">
                    <Suspense fallback={<MobilePreviewSkeleton />}>
                      <CurrentScreenComponent onNavigate={handleNavigate} onBack={handleBack} />
                    </Suspense>
                  </div>

                  {/* Home Indicator */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-28 h-1 bg-muted-foreground/30 rounded-full" />
                </div>
              </div>

              {/* Screen Name */}
              <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 text-center">
                <span className="text-lg font-bold text-foreground">{screens[currentScreen].name}</span>
                <span className="text-sm ml-2 text-muted-foreground">{currentScreen + 1} / {screens.length}</span>
              </div>
            </div>

            <button 
              onClick={nextScreen} 
              className="p-4 rounded-2xl transition-all duration-300 bg-card hover:bg-card-hover shadow-lg border border-border"
              aria-label="Próxima tela"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MobilePreviewV2Page;
