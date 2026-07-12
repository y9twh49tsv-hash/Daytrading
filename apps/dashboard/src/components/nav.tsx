'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ArrowLeftRight,
  Gauge,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Übersicht', icon: LayoutDashboard },
  { href: '/control', label: 'Bot-Steuerung', icon: SlidersHorizontal },
  { href: '/settings', label: 'Strategie', icon: Settings },
  { href: '/trades', label: 'Trades', icon: ArrowLeftRight },
  { href: '/orders', label: 'Orders', icon: ListOrdered },
  { href: '/logs', label: 'System-Logs', icon: ScrollText },
  { href: '/risk', label: 'Risiko', icon: Gauge },
  { href: '/api-config', label: 'API-Konfiguration', icon: KeyRound },
];

export function Nav({
  email,
  signOutAction,
}: {
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-2 border-t pt-4">
      <p className="truncate px-3 text-xs text-muted-foreground" title={email}>
        {email}
      </p>
      <form action={signOutAction}>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-3 px-3" type="submit">
          <LogOut className="h-4 w-4" />
          Abmelden
        </Button>
      </form>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b px-4 py-3 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <Activity className="h-5 w-5 text-primary" />
          Daytrading Bot
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="Menü">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-b bg-card p-4 lg:hidden">
          <div className="flex flex-col gap-4">
            {links}
            {footer}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card p-4 lg:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-3 font-semibold">
          <Activity className="h-5 w-5 text-primary" />
          Daytrading Bot
        </Link>
        {links}
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          <ShieldAlert className="mb-1 h-4 w-4" />
          Testnet / Paper-Modus. Kein echtes Geld. Keine Gewinngarantie.
        </div>
        {footer}
      </aside>
    </>
  );
}
