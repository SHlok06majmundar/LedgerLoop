'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Building2, Check, ChevronsUpDown, LogOut, Menu, Plus, Shield, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/auth';
import { humanize } from '@/lib/format';
import { useCurrentMembership, useMemberships } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { initials } from '@/lib/utils';
import { NotificationsBell } from './notifications-bell';
import { SidebarNav } from './sidebar';

function OrganizationSwitcher() {
  const { data: memberships = [] } = useMemberships();
  const current = useCurrentMembership();
  const setOrganization = useSession((s) => s.setOrganization);
  const queryClient = useQueryClient();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="max-w-56 justify-between">
          <Building2 className="text-muted-foreground" />
          <span className="truncate">{current?.organization.name ?? 'Select organization'}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => {
              setOrganization(m.organization.id);
              queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'memberships' });
              router.push('/dashboard');
            }}
          >
            <span className="flex-1 truncate">{m.organization.name}</span>
            <span className="text-xs text-muted-foreground">{humanize(m.role)}</span>
            {m.organization.id === current?.organization.id && <Check className="text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/onboarding')}>
          <Plus /> New organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const user = useSession((s) => s.user);
  const router = useRouter();
  const queryClient = useQueryClient();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          aria-label="Account menu"
        >
          {initials(user.name)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <p className="font-medium text-foreground">{user.name}</p>
          <p className="truncate">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/settings')}>
          <UserRound /> Profile & settings
        </DropdownMenuItem>
        {user.isSuperAdmin && (
          <DropdownMenuItem onSelect={() => router.push('/admin')}>
            <Shield /> Admin panel
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            queryClient.clear();
            router.replace('/login');
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        </DialogTrigger>
        <DialogContent title="Navigation" className="top-0 left-0 h-dvh max-w-72 translate-x-0 translate-y-0 rounded-none">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Logo href="/dashboard" className="lg:hidden [&>span]:hidden sm:[&>span]:inline" />
      <div className="hidden sm:block">
        <OrganizationSwitcher />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}

export { OrganizationSwitcher };
