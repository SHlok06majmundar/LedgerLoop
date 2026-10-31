import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';

/** A headline number: label, value in primary ink, optional context line. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  loading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'danger' | 'success';
  loading?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <Icon
            className={cn(
              'size-4',
              tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-muted-foreground',
            )}
          />
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-28" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular">{value}</p>
      )}
      {hint && !loading && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
