import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Two interlocking loops: an invoice and a payment closing the circle. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <circle cx="13" cy="16" r="6" fill="none" stroke="white" strokeWidth="2.5" />
      <circle cx="19" cy="16" r="6" fill="none" stroke="white" strokeOpacity="0.65" strokeWidth="2.5" />
    </svg>
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <LogoMark />
      <span className="text-lg">LedgerLoop</span>
    </Link>
  );
}
