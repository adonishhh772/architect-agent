import { Link, useLocation } from "react-router-dom";
import { FileUp, Home, KeyRound, LayoutDashboard, Lock, LockOpen, Menu, Moon, PanelLeftClose, PanelLeftOpen, Shield, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import clsx from "clsx";
import { useTheme } from "../../features/theme/useTheme";
import { useSession } from "../../features/session/SessionProvider";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CLOSE_MENU_BACKDROP_LABEL,
  CLOSE_MENU_LABEL,
  EXPAND_MENU_LABEL,
  MINIMIZE_MENU_LABEL,
  OPEN_MENU_LABEL,
  readSidebarCollapsed,
  SIDEBAR_COLLAPSED_KEY,
  sidebarCollapsedStorageValue,
} from "./shellNavigation";

interface AppShellProps {
  children: ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Start", icon: Home },
  { to: "/workspace", label: "Workspace", icon: LayoutDashboard },
  { to: "/providers", label: "Providers", icon: KeyRound },
  { to: "/import", label: "Import", icon: FileUp },
];

const VAULT_STATUS_LABEL = {
  unlocked: "Unlocked",
  locked: "Locked",
  missing: "Not created",
} as const;

export function AppShell({ children }: AppShellProps): JSX.Element {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const session = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readStoredSidebarCollapsed);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }
    const handleEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileMenuOpen]);

  const vaultLabel = vaultStatusLabel(session.vaultStatus);

  const handleToggleMobileMenu = (): void => {
    setMobileMenuOpen((open) => !open);
  };

  const handleCloseMobileMenu = (): void => {
    setMobileMenuOpen(false);
  };

  const handleToggleSidebar = (): void => {
    const nextCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(nextCollapsed);
    persistSidebarCollapsed(nextCollapsed);
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      setMobileMenuOpen(false);
    }
  };

  return (
    <div
      className={clsx(
        "min-h-screen lg:grid",
        sidebarCollapsed ? "lg:grid-cols-[5.5rem_1fr]" : "lg:grid-cols-[280px_1fr]",
      )}
    >
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[var(--md-outline)]/20 bg-[var(--md-surface)]/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Shield className="h-5 w-5 shrink-0 text-[var(--color-neon-blue)]" aria-hidden />
          <p className="truncate text-sm font-semibold">Architecture Sentinel</p>
        </div>
        <button
          type="button"
          className="glass-button shrink-0"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-primary-navigation"
          data-testid="mobile-menu-button"
          onClick={handleToggleMobileMenu}
        >
          {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          <span className="sr-only">{mobileMenuOpen ? CLOSE_MENU_LABEL : OPEN_MENU_LABEL}</span>
        </button>
      </header>

      {mobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label={CLOSE_MENU_BACKDROP_LABEL}
          data-testid="mobile-menu-backdrop"
          onClick={handleCloseMobileMenu}
        />
      )}

      {mobileMenuOpen && (
        <div
          id="mobile-primary-navigation"
          className="fixed top-16 right-3 left-3 z-40 max-h-[calc(100vh-5rem)] overflow-y-auto lg:hidden"
          data-testid="mobile-menu"
          onKeyDown={handleMenuKeyDown}
        >
          <div className="glass-card space-y-4 !p-4">
            <p className="rounded-xl bg-[var(--md-surface-container-high)] px-3 py-2 text-xs text-[var(--md-on-surface-variant)]">
              Vault: {vaultLabel}
            </p>
            <PrimaryNav pathname={location.pathname} collapsed={false} onNavigate={handleCloseMobileMenu} />
            <ThemeToggle theme={theme} collapsed={false} onToggleTheme={toggleTheme} />
          </div>
        </div>
      )}

      <aside
        className={clsx(
          "glass-card m-4 hidden h-[calc(100vh-2rem)] flex-col lg:sticky lg:top-4 lg:flex",
          sidebarCollapsed ? "!p-3" : undefined,
        )}
        data-testid="desktop-sidebar"
        data-collapsed={sidebarCollapsed ? "true" : "false"}
      >
        <div className={clsx("mb-6 flex items-center", sidebarCollapsed ? "justify-center" : "gap-3")}>
          <Shield className="h-6 w-6 shrink-0 text-[var(--color-neon-blue)]" aria-hidden />
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Architecture
              </p>
              <h1 className="text-lg font-semibold">Sentinel</h1>
            </div>
          )}
        </div>
        <p
          className={clsx(
            "mb-3 flex items-center rounded-xl bg-[var(--md-surface-container-high)] text-xs text-[var(--md-on-surface-variant)]",
            sidebarCollapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2",
          )}
          data-testid="sidebar-vault-status"
          title={`Vault: ${vaultLabel}`}
        >
          {session.vaultStatus === "unlocked" ? (
            <LockOpen className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {sidebarCollapsed ? <span className="sr-only">Vault: {vaultLabel}</span> : <span>Vault: {vaultLabel}</span>}
        </p>
        <PrimaryNav pathname={location.pathname} collapsed={sidebarCollapsed} onNavigate={handleCloseMobileMenu} />
        <div className="mt-auto space-y-2 pt-6">
          <ThemeToggle theme={theme} collapsed={sidebarCollapsed} onToggleTheme={toggleTheme} />
          <button
            type="button"
            className={clsx("glass-button w-full", sidebarCollapsed && "!px-2")}
            aria-pressed={sidebarCollapsed}
            data-testid="toggle-sidebar"
            onClick={handleToggleSidebar}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            ) : (
              <PanelLeftClose className="mr-2 h-4 w-4" aria-hidden />
            )}
            {sidebarCollapsed ? <span className="sr-only">{EXPAND_MENU_LABEL}</span> : MINIMIZE_MENU_LABEL}
          </button>
        </div>
      </aside>
      <main className="min-w-0 p-4 lg:p-8">{children}</main>
    </div>
  );
}

interface PrimaryNavProps {
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}

function PrimaryNav({ pathname, collapsed, onNavigate }: PrimaryNavProps): JSX.Element {
  return (
    <nav aria-label="Primary" className="space-y-2">
      {NAV_ITEMS.map((item) => (
        <PrimaryNavLink
          key={item.to}
          item={item}
          active={pathname === item.to}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

interface PrimaryNavLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}

function PrimaryNavLink({ item, active, collapsed, onNavigate }: PrimaryNavLinkProps): JSX.Element {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={item.label}
      data-testid={`nav-${item.label.toLowerCase()}`}
      className={clsx(
        "flex items-center rounded-xl px-3 py-2 text-sm transition",
        collapsed ? "justify-center" : "gap-2",
        active
          ? "bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] ring-1 ring-[var(--md-primary)]/30"
          : "text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container-high)]",
      )}
      onClick={onNavigate}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && item.label}
    </Link>
  );
}

interface ThemeToggleProps {
  theme: string;
  collapsed: boolean;
  onToggleTheme: () => void;
}

function ThemeToggle({ theme, collapsed, onToggleTheme }: ThemeToggleProps): JSX.Element {
  const dark = theme === "dark";
  return (
    <button type="button" className={clsx("glass-button w-full", collapsed && "!px-2")} onClick={onToggleTheme}>
      {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      {collapsed ? <span className="sr-only">Toggle theme</span> : <span className="ml-2">Toggle theme</span>}
    </button>
  );
}

function vaultStatusLabel(status: string): string {
  if (status === "unlocked") {
    return VAULT_STATUS_LABEL.unlocked;
  }
  if (status === "locked") {
    return VAULT_STATUS_LABEL.locked;
  }
  return VAULT_STATUS_LABEL.missing;
}

function readStoredSidebarCollapsed(): boolean {
  try {
    return readSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY));
  } catch {
    return false;
  }
}

function persistSidebarCollapsed(collapsed: boolean): void {
  try {
    const stored = sidebarCollapsedStorageValue(collapsed);
    if (stored === null) {
      localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
      return;
    }
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, stored);
  } catch {
    return;
  }
}
