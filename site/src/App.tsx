import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/hooks/useTheme";
import LangProvider from "@/components/site/LangProvider";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import SkipNavLink from "@/components/a11y/SkipNavLink";
import CookieConsent from "@/components/CookieConsent";
import { AuthProvider } from "@/hooks/useAuth";
import { lazy, Suspense } from "react";
import DemoLayout from "@/components/site/DemoLayout";
import SiteLayout from "@/components/site/SiteLayout";
import nooweOoIcon from "@/assets/noowe-oo-icon.png";

const SiteHome = lazy(() => import("./pages/SiteHome"));
const SitePlatform = lazy(() => import("./pages/SitePlatform"));
const SiteRequestDemo = lazy(() => import("./pages/SiteRequestDemo"));
const SiteAccess = lazy(() => import("./pages/SiteAccess"));
const SiteIntentCapture = lazy(() => import("./pages/SiteIntentCapture"));
const SiteDemoHub = lazy(() => import("./pages/SiteDemoHub"));
const SiteForYou = lazy(() => import("./pages/SiteForYou"));
const SiteImpact = lazy(() => import("./pages/SiteImpact"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback"));
const AdminSimulationLeads = lazy(() => import("./pages/AdminSimulationLeads"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const DemoClient = lazy(() => import("./pages/DemoClient"));
const DemoRestaurant = lazy(() => import("./pages/DemoRestaurant"));
const GuidedSimulation = lazy(() => import("./pages/GuidedSimulation"));
const MobilePreviewV2 = lazy(() => import("./pages/MobilePreviewV2"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SiteTerms = lazy(() => import("./pages/SiteTerms"));
const SitePrivacy = lazy(() => import("./pages/SitePrivacy"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="flex flex-col items-center gap-3">
      <img
        src={nooweOoIcon}
        alt="Carregando..."
        className="h-12 w-12 animate-[noowe-loader-pulse_1.8s_cubic-bezier(0.4,0,0.6,1)_infinite]"
        draggable={false}
      />
      <span className="text-xs text-muted-foreground tracking-widest uppercase animate-pulse">
        carregando
      </span>
    </div>
  </div>
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LangProvider>
          <TooltipProvider>
            <ErrorBoundary>
              <AuthProvider>
                <SkipNavLink />
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Suspense fallback={<PageLoader />}>
                    <div id="main-content">
                      <Routes>
                        <Route element={<SiteLayout />}>
                          <Route path="/" element={<SiteHome />} />
                          <Route path="/platform" element={<SitePlatform />} />
                          <Route path="/request-demo" element={<SiteRequestDemo />} />
                          <Route path="/access" element={<SiteAccess />} />
                          <Route path="/para-voce" element={<SiteForYou />} />
                          <Route path="/terms" element={<SiteTerms />} />
                          <Route path="/privacy" element={<SitePrivacy />} />
                        </Route>
                        <Route path="/demo" element={<DemoLayout />}>
                          <Route index element={<SiteDemoHub />} />
                          <Route path="intent" element={<SiteIntentCapture />} />
                          <Route path="impact" element={<SiteImpact />} />
                          <Route path="guided" element={<GuidedSimulation />} />
                          <Route path="client" element={<DemoClient />} />
                          <Route path="restaurant" element={<DemoRestaurant />} />
                        </Route>
                        <Route path="/auth/callback" element={<AuthCallback />} />
                        <Route path="/auth/reset-password" element={<ResetPassword />} />
                        <Route path="/admin" element={<AdminDashboard />} />
                        <Route path="/admin/feedback" element={<AdminFeedback />} />
                        <Route path="/admin/simulation" element={<AdminSimulationLeads />} />
                        <Route path="/mobile-v2" element={<MobilePreviewV2 />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </div>
                  </Suspense>
                </BrowserRouter>
                <CookieConsent />
              </AuthProvider>
            </ErrorBoundary>
          </TooltipProvider>
        </LangProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
