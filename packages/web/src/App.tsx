import { useState, useEffect, useRef, useContext, createContext } from "react";
import type { RefObject } from "react";
import { useTheme } from "./hooks/useTheme";
import { BrowserRouter, Routes, Route, Link, Navigate, Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NewRecipeModalProvider } from "./context/NewRecipeModalContext";
import RecipeList from "./pages/RecipeList";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeForm from "./pages/RecipeForm";
import CookbookDetail from "./pages/CookbookDetail";
import MealPlan from "./pages/MealPlan";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import InvitePage from "./pages/InvitePage";
import IconCompare from "./pages/IconCompare";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import SupportPage from "./pages/SupportPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import LandingPage from "./pages/LandingPage";
import LandingPageV2 from "./pages/LandingPageV2";
import BottomNav from "./components/BottomNav";
import NewRecipeModal from "./components/NewRecipeModal";
import PWAUpdateBanner from "./components/PWAUpdateBanner";
import OfflineBanner from "./components/OfflineBanner";

/**
 * The signed-in app's scrolling element (see `.pk-shell-scroll` in index.css).
 * The document itself no longer scrolls there, so anything that used to read
 * `window.scrollY` or call `window.scrollTo` has to go through this instead.
 * Null on the routes that keep normal document scrolling — login, invite,
 * privacy, the landing pages — where the fallbacks to `window` still apply.
 */
const AppScrollContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

function AppLayout() {
  const { user, loading } = useAuth();

  // Only redirect once auth has finished loading. While loading, render the
  // shell (Header + page content) so pages can show their own skeletons
  // instead of a blank "Loading…" screen.
  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Header />
      {/* No nav-clearing bottom padding any more: the nav is a sibling of the
          scroller, not a fixed bar painted over the end of the page. */}
      <main className="mx-auto" style={{ maxWidth: 1100, padding: '28px 24px 40px' }}>
        <Outlet />
      </main>
    </>
  );
}

const TOP_LEVEL_ROUTES = ['/', '/meal-plan', '/profile'];

function Header() {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const location = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const scrollRef = useContext(AppScrollContext);

  const isTopLevel = TOP_LEVEL_ROUTES.includes(location.pathname);
  const showBack = !isTopLevel;

  useEffect(() => {
    // Passive effects run after every ref in the commit is attached, so the
    // shell's scroller is already there on the first pass.
    const el = scrollRef?.current ?? null;
    const target: HTMLElement | Window = el ?? window;
    function onScroll() {
      const y = el ? el.scrollTop : window.scrollY;
      setHidden(y > lastScrollY.current && y > 56);
      lastScrollY.current = y;
    }
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  function handleBack() {
    // If the user navigated here from within the app, go back in history
    // If they landed directly (POP = refresh/deep link), fall back to home
    if (navType === 'POP') {
      navigate('/');
    } else {
      navigate(-1);
    }
  }

  return (
    <header
      className="sticky top-0 z-50"
      // Opaque, no backdrop-filter — same reason as BottomNav (see --bar-bg in
      // index.css). A blurred bar pinned over the scroller drops iOS onto
      // main-thread scrolling, which is what un-pinned the bottom nav.
      style={{
        height: 56,
        background: 'var(--bar-bg)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
        transition: 'transform 0.3s ease',
      }}
    >
      <div
        className="mx-auto h-full relative flex items-center justify-center"
        style={{ maxWidth: 1100, padding: '0 24px' }}
      >
        {showBack && (
          <button
            onClick={handleBack}
            className="absolute left-0 flex items-center text-sm"
            style={{ color: 'var(--muted)', marginLeft: 24, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
          >
            &larr; Back
          </button>
        )}
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

  const isPublicInfo = location.pathname === '/privacy' || location.pathname === '/support';

  if (!isPublicInfo && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </div>
    );
  }

  if (!isPublicInfo && user) {
    window.location.href = APP_URL;
    return null;
  }

  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<LandingPageV2 />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/support" element={<SupportPage />} />
        {import.meta.env.DEV && <Route path="/landing-old" element={<LandingPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  const scrollRef = useContext(AppScrollContext);
  useEffect(() => {
    if (scrollRef?.current) scrollRef.current.scrollTop = 0;
    else window.scrollTo(0, 0);
  }, [pathname, scrollRef]);
  return null;
}

const NAV_FREE_ROUTES = ['/login', '/invite', '/reset-password', '/privacy', '/support', '/landing', '/landing-old'];

function AppShell() {
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  useTheme();

  const hideNav = NAV_FREE_ROUTES.includes(location.pathname);
  const locked = !isMarketingSite && !hideNav;

  // The shell owns the scrolling wherever the nav is on screen, so the document
  // behind it must not scroll or rubber-band.
  useEffect(() => {
    if (!locked) return;
    const root = document.documentElement;
    root.classList.add('pk-locked');
    return () => root.classList.remove('pk-locked');
  }, [locked]);

  if (isMarketingSite) {
    return <MarketingShell />;
  }

  const routes = (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/support" element={<SupportPage />} />
      {import.meta.env.DEV && <Route path="/landing" element={<LandingPageV2 />} />}
      {import.meta.env.DEV && <Route path="/landing-old" element={<LandingPage />} />}
      {import.meta.env.DEV && <Route path="/icon-compare" element={<div className="mx-auto" style={{ maxWidth: 1100, padding: '28px 24px 96px' }}><IconCompare /></div>} />}
      <Route element={<AppLayout />}>
        <Route path="/" element={<RecipeList />} />
        <Route path="/new" element={<RecipeForm />} />
        <Route path="/recipe/:id" element={<RecipeDetail />} />
        <Route path="/recipe/:id/edit" element={<RecipeForm />} />
        <Route path="/cookbook/:id" element={<CookbookDetail />} />
        <Route path="/meal-plan" element={<MealPlan />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/icon-compare" element={<IconCompare />} />
      </Route>
    </Routes>
  );

  return (
    <NewRecipeModalProvider>
      <AppScrollContext.Provider value={locked ? scrollRef : null}>
        <ScrollToTop />
        {locked ? (
          // Fixed-height column: one scrolling region, nav pinned as its last
          // flex child. See `.pk-shell` in index.css for why it isn't fixed.
          <div className="pk-shell">
            <div className="pk-shell-scroll" ref={scrollRef}>
              {routes}
            </div>
            <BottomNav />
          </div>
        ) : (
          <div className="min-h-screen">{routes}</div>
        )}
        <NewRecipeModal />
        <PWAUpdateBanner />
        <OfflineBanner />
      </AppScrollContext.Provider>
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
