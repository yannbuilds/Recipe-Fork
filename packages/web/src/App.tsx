import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NewRecipeModalProvider } from "./context/NewRecipeModalContext";
import RecipeList from "./pages/RecipeList";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeForm from "./pages/RecipeForm";
import MealPlan from "./pages/MealPlan";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import InvitePage from "./pages/InvitePage";
import IconCompare from "./pages/IconCompare";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import LandingPage from "./pages/LandingPage";
import BottomNav from "./components/BottomNav";
import NewRecipeModal from "./components/NewRecipeModal";
import PWAUpdateBanner from "./components/PWAUpdateBanner";
import OfflineBanner from "./components/OfflineBanner";

function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Header />
      <main className="mx-auto" style={{ maxWidth: 1100, padding: '28px 24px 96px' }}>
        <Outlet />
      </main>
    </>
  );
}

function Header() {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setHidden(y > lastScrollY.current && y > 56);
      lastScrollY.current = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        height: 56,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
        transition: 'transform 0.3s ease',
      }}
    >
      <div
        className="mx-auto h-full flex items-center justify-center"
        style={{ maxWidth: 1100, padding: '0 24px' }}
      >
        <Link to="/">
          <span className="rf-heading text-lg font-bold" style={{ color: 'var(--text)' }}>
            Pie Keeper
          </span>
        </Link>
      </div>
    </header>
  );
}

const isMarketingSite =
  window.location.hostname === 'piekeeper.com' ||
  window.location.hostname === 'www.piekeeper.com';

const APP_URL = import.meta.env.VITE_APP_URL || "https://app.piekeeper.com";

function MarketingShell() {
  const { user, loading } = useAuth();
  const location = useLocation();

  const isPrivacy = location.pathname === '/privacy';

  if (!isPrivacy && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </div>
    );
  }

  if (!isPrivacy && user) {
    window.location.href = APP_URL;
    return null;
  }

  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function AppShell() {
  const location = useLocation();

  if (isMarketingSite) {
    return <MarketingShell />;
  }

  const hideNav = location.pathname === '/login' || location.pathname === '/invite' || location.pathname === '/privacy' || location.pathname === '/landing';

  return (
    <NewRecipeModalProvider>
      <ScrollToTop />
      <div className="min-h-screen">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite" element={<InvitePage />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          {import.meta.env.DEV && <Route path="/landing" element={<LandingPage />} />}
          {import.meta.env.DEV && <Route path="/icon-compare" element={<div className="mx-auto" style={{ maxWidth: 1100, padding: '28px 24px 96px' }}><IconCompare /></div>} />}
          <Route element={<AppLayout />}>
            <Route path="/" element={<RecipeList />} />
            <Route path="/new" element={<RecipeForm />} />
            <Route path="/recipe/:id" element={<RecipeDetail />} />
            <Route path="/recipe/:id/edit" element={<RecipeForm />} />
            <Route path="/meal-plan" element={<MealPlan />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/icon-compare" element={<IconCompare />} />
          </Route>
        </Routes>
        {!hideNav && <BottomNav />}
        <NewRecipeModal />
        <PWAUpdateBanner />
        <OfflineBanner />
      </div>
    </NewRecipeModalProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
