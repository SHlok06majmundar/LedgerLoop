'use client';

import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { apiPage } from '@/lib/api';
import { dateTime, humanize } from '@/lib/format';
import { useOrgQueryKey } from '@/lib/hooks';

interface AuditEntry {
  id: string;
  action: string;
  userId: { name: string; email: string } | null;
  createdAt: string;
  requestId?: string;
}

/** Audit history for one record, newest first. */
export function ActivityFeed({ entityType, entityId }: { entityType: string; entityId: string }) {
  const query = useQuery({
    queryKey: useOrgQueryKey('audit', entityType, entityId),
    queryFn: () => apiPage<AuditEntry>('/audit-logs', { query: { entityType, entityId, limit: 50 } }),
  });

  if (query.isPending) return <Skeleton className="h-32" />;
  if (query.isError || query.data.items.length === 0) {
    return <EmptyState icon={History} title="No activity recorded" />;
  }
  return (
    <ol className="relative ml-2 border-l">
      {query.data.items.map((entry) => (
        <li key={entry.id} className="mb-5 ml-5">
          <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-card bg-primary" />
          <p className="text-sm font-medium">{humanize(entry.action.replace('.', ' '))}</p>
          <p className="text-xs text-muted-foreground">
            {entry.userId?.name ?? 'System'} · {dateTime(entry.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
