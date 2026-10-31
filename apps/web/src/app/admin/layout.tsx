'use client';

import { ArrowLeft, Building2, LayoutDashboard, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthGate } from '@/components/app/auth-gate';
import { LogoMark } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { ErrorState } from '@/components/ui/feedback';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/organizations', label: 'Organizations', icon: Building2 },
  { href: '/admin/users', label: 'Users', icon: Users },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const user = useSession((s) => s.user);
  const pathname = usePathname();
  if (!user?.isSuperAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <ErrorState message="The admin panel is only available to LedgerLoop Super Admins." />
      </div>
    );
  }
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <LogoMark />
            <span className="hidden sm:inline">LedgerLoop</span>
            <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-accent-foreground">
              <ShieldCheck className="size-3.5" /> Admin
            </span>
          </Link>
          <nav className="flex gap-1 overflow-x-auto" aria-label="Admin">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
                    active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Back to app</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AdminShell>{children}</AdminShell>
    </AuthGate>
  );
}
