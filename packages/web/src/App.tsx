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
import PrivacyPolicy from "./pages/PrivacyPolicy";
import BottomNav from "./components/BottomNav";
import NewRecipeModal from "./components/NewRecipeModal";

function AppLayout() {
  const { user, loading } = useAuth();

  // TEMPORARY: Auth bypass for testing — uncomment the block below to re-enable login
  // if (loading) {
  //   return (
  //     <div className="flex items-center justify-center py-20">
  //       <div style={{ color: 'var(--muted)' }}>Loading…</div>
  //     </div>
  //   );
  // }
  // if (!user) {
  //   return <Navigate to="/login" replace />;
  // }

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

function AppShell() {
  const location = useLocation();
  const hideNav = location.pathname === '/login' || location.pathname === '/privacy';

  return (
    <NewRecipeModalProvider>
      <div className="min-h-screen">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<RecipeList />} />
            <Route path="/new" element={<RecipeForm />} />
            <Route path="/recipe/:id/edit" element={<RecipeForm />} />
            <Route path="/meal-plan" element={<MealPlan />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Routes>
        {!hideNav && <BottomNav />}
        <NewRecipeModal />
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
