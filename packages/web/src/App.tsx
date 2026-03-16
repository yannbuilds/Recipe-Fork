import { BrowserRouter, Routes, Route, Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import RecipeList from "./pages/RecipeList";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeForm from "./pages/RecipeForm";
import MealPlan from "./pages/MealPlan";
import LoginPage from "./pages/LoginPage";

function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </>
  );
}

function Header() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  function navClass(path: string) {
    const active = location.pathname === path;
    return `text-sm font-medium transition-colors ${
      active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
    }`;
  }

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Recipe Fork</h1>
          </Link>
          <nav className="hidden sm:flex gap-4">
            <Link to="/" className={navClass('/')}>Recipes</Link>
            <Link to="/meal-plan" className={navClass('/meal-plan')}>Meal Plan</Link>
          </nav>
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500 hidden sm:inline">{user.email}</span>
            <button
              onClick={signOut}
              className="text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
      {/* Mobile nav */}
      <nav className="sm:hidden flex gap-4 px-4 pb-3">
        <Link to="/" className={navClass('/')}>Recipes</Link>
        <Link to="/meal-plan" className={navClass('/meal-plan')}>Meal Plan</Link>
      </nav>
    </header>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<RecipeList />} />
              <Route path="/new" element={<RecipeForm />} />
              <Route path="/recipe/:id" element={<RecipeDetail />} />
              <Route path="/recipe/:id/edit" element={<RecipeForm />} />
              <Route path="/meal-plan" element={<MealPlan />} />
            </Route>
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
