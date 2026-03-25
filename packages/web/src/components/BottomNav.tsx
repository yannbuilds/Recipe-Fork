import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { House, CalendarDays, PlusCircle, ShoppingCart, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNewRecipeModal } from '../context/NewRecipeModalContext';

const NAV_ITEMS: { to: string; icon: LucideIcon; label: string; exact?: boolean; action?: boolean; activeCheck?: (pathname: string, search: string) => boolean }[] = [
  { to: '/', icon: House, label: 'Home', exact: true },
  { to: '/meal-plan', icon: CalendarDays, label: 'Plan', activeCheck: (p, s) => p === '/meal-plan' && !s.includes('tab=shopping') },
  { to: '/new', icon: PlusCircle, label: 'Add', action: true },
  { to: '/meal-plan?tab=shopping', icon: ShoppingCart, label: 'Shop', activeCheck: (p, s) => p === '/meal-plan' && s.includes('tab=shopping') },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const { pathname, search } = useLocation();
  const { openModal } = useNewRecipeModal();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--border)',
        boxShadow: '0 -1px 3px rgba(0,0,0,0.04)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        willChange: 'transform',
        transform: 'translateZ(0)',
      }}
    >
      <div className="flex items-center justify-around" style={{ height: 64 }}>
        {NAV_ITEMS.map(({ to, icon: Icon, label, exact, action, activeCheck }) => {
          const active = activeCheck
            ? activeCheck(pathname, search)
            : exact ? pathname === to : pathname.startsWith(to);

          if (action) {
            return (
              <button
                key={to}
                onClick={openModal}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors"
                style={{
                  color: 'var(--muted)',
                  fontWeight: 500,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Icon size={22} strokeWidth={1.8} />
                <span style={{ fontSize: 11 }}>{label}</span>
              </button>
            );
          }

          return (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors"
              style={{
                color: active ? 'var(--green)' : 'var(--muted)',
                fontWeight: active ? 600 : 500,
                textDecoration: 'none',
              }}
            >
              <Icon size={active ? 24 : 22} strokeWidth={active ? 2.2 : 1.8} style={{ transition: 'all 0.2s ease' }} />
              <span style={{ fontSize: 11 }}>{label}</span>
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'var(--green)',
                  opacity: active ? 1 : 0,
                  transition: 'opacity 0.2s ease',
                }}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
