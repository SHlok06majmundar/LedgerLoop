'use client';

import * as Popover from '@radix-ui/react-popover';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { apiPage, api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { AppNotification } from '@/lib/types';
import { cn } from '@/lib/utils';

export function NotificationsBell() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiPage<AppNotification>('/notifications', { query: { limit: 15 }, noOrg: true }),
    refetchInterval: 60_000,
  });
  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST', noOrg: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread = data?.meta.unread ?? 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-80 rounded-xl border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button className="text-xs text-primary hover:underline" onClick={() => readAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">You are all caught up.</p>
            ) : (
              data!.items.map((n) => (
                <Popover.Close asChild key={n.id}>
                  <Link
                    href={n.link ?? '#'}
                    className={cn('block border-b px-4 py-3 last:border-0 hover:bg-muted', !n.readAt && 'bg-primary-soft/40')}
                  >
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</p>
                  </Link>
                </Popover.Close>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
