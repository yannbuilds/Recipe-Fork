import { Link, useLocation } from 'react-router-dom';
import { House, CalendarDays, PlusCircle, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const NAV_ITEMS: { to: string; icon: LucideIcon; label: string; exact?: boolean }[] = [
  { to: '/', icon: House, label: 'Home', exact: true },
  { to: '/meal-plan', icon: CalendarDays, label: 'Plan' },
  { to: '/new', icon: PlusCircle, label: 'Add' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const { pathname } = useLocation();

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
      }}
    >
      <div className="flex items-center justify-around" style={{ height: 64 }}>
        {NAV_ITEMS.map(({ to, icon: Icon, label, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to);
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
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span style={{ fontSize: 11 }}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
