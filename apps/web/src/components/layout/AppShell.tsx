import { Link, useLocation } from "react-router-dom";
import { FileUp, Home, KeyRound, LayoutDashboard, Moon, Shield, Sun } from "lucide-react";
import { useTheme } from "../../features/theme/useTheme";
import { useSession } from "../../features/session/SessionProvider";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface AppShellProps {
  children: ReactNode;
}

const NAV_ITEMS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/", label: "Start", icon: Home },
  { to: "/workspace", label: "Workspace", icon: LayoutDashboard },
  { to: "/providers", label: "Providers", icon: KeyRound },
  { to: "/import", label: "Import", icon: FileUp },
];

export function AppShell({ children }: AppShellProps): JSX.Element {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const session = useSession();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="glass-card m-4 flex h-[calc(100vh-2rem)] flex-col lg:sticky lg:top-4">
        <div className="mb-8 flex items-center gap-3">
          <Shield className="h-6 w-6 text-[var(--color-neon-blue)]" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Architecture
            </p>
            <h1 className="text-lg font-semibold">Sentinel</h1>
          </div>
        </div>
        <p
          className="mb-3 rounded-xl bg-[var(--md-surface-container-high)] px-3 py-2 text-xs text-[var(--md-on-surface-variant)]"
          data-testid="sidebar-vault-status"
        >
          Vault:{" "}
          {session.vaultStatus === "unlocked"
            ? "Unlocked"
            : session.vaultStatus === "locked"
              ? "Locked"
              : "Not created"}
        </p>
        <nav aria-label="Primary" className="space-y-2">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                  active
                    ? "bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] ring-1 ring-[var(--md-primary)]/30"
                    : "text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container-high)]"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-8">
          <button type="button" className="glass-button w-full" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            Toggle theme
          </button>
        </div>
      </aside>
      <main className="p-4 lg:p-8">{children}</main>
    </div>
  );
}
