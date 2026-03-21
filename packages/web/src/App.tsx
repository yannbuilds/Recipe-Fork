import { BrowserRouter, Routes, Route, Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import RecipeList from "./pages/RecipeList";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeForm from "./pages/RecipeForm";
import MealPlan from "./pages/MealPlan";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import BottomNav from "./components/BottomNav";

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
      <main className="mx-auto" style={{ maxWidth: 1100, padding: '28px 24px 64px' }}>
        <Outlet />
      </main>
    </>
  );
}

function Header() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  function navLink(path: string, label: string) {
    const active = location.pathname === path;
    return (
      <Link
        to={path}
        className="text-sm transition-colors"
        style={{
          color: active ? 'var(--green)' : 'var(--muted)',
          fontWeight: active ? 600 : 500,
        }}
      >
        {label}
      </Link>
    );
  }

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
      }}
    >
      <div
        className="mx-auto h-full flex items-center justify-between"
        style={{ maxWidth: 1100, padding: '0 24px' }}
      >
        <div className="flex items-center gap-6">
          <Link to="/">
            <span className="rf-heading text-lg font-bold" style={{ color: 'var(--text)' }}>
              Recipe Fork
            </span>
          </Link>
          <nav className="hidden sm:flex gap-4">
            {navLink('/', 'Recipes')}
            {navLink('/meal-plan', 'Meal Plan')}
          </nav>
        </div>
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline" style={{ color: 'var(--muted)' }}>{user.email}</span>
            <button
              onClick={signOut}
              className="transition-colors"
              style={{ color: 'var(--muted)' }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link to="/login" className="text-sm font-medium" style={{ color: 'var(--green)' }}>
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function AppShell() {
  const location = useLocation();
  const hideNav = location.pathname === '/login';

  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
    </div>
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
