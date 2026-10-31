'use client';

import { hasPermission, type Role } from '@ledgerloop/shared-types';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/brand';
import { useCurrentMembership } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { APP_NAV } from './nav';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const membership = useCurrentMembership();
  const role = membership?.role as Role | undefined;

  return (
    <nav className="grid gap-0.5" aria-label="App">
      {APP_NAV.filter((item) => !item.permission || (role && hasPermission(role, item.permission))).map(
        ({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-soft text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        },
      )}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-card px-3 py-5 lg:flex">
      <Logo href="/dashboard" className="px-3" />
      <SidebarNav />
    </aside>
  );
}
