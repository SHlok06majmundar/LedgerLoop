import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { humanize } from '@/lib/format';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        brand: 'bg-primary-soft text-accent-foreground',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        info: 'bg-info-soft text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

type Tone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

const STATUS_TONES: Record<string, Tone> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  VOID: 'neutral',
  POSTED: 'success',
  REVERSED: 'neutral',
  ACTIVE: 'success',
  DISABLED: 'neutral',
  MATCHED: 'success',
  SUGGESTED: 'info',
  PARTIALLY_MATCHED: 'warning',
  DISCREPANCY: 'danger',
  UNMATCHED: 'warning',
  REJECTED: 'neutral',
  IGNORED: 'neutral',
  OPEN: 'warning',
  RESOLVED: 'success',
  COMPLETED: 'success',
  PROCESSING: 'info',
  QUEUED: 'info',
  AWAITING_MAPPING: 'warning',
  FAILED: 'danger',
  RUNNING: 'info',
  SCHEDULED: 'info',
  SENT: 'success',
  CANCELLED: 'neutral',
};

/** Consistent colour for any domain status value. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} className={className}>
      {humanize(status)}
    </Badge>
  );
}
