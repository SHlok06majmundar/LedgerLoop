import Link from 'next/link';
import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Two interlocking loops: an invoice and the payment that closes it.
 * Same artwork as brand/logo-mark.svg (the source for app icons and favicons).
 */
export function LogoMark({ className }: { className?: string }) {
  const gradient = useId();
  return (
    <svg viewBox="0 0 512 512" className={cn('size-7', className)} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14918a" />
          <stop offset="1" stopColor="#0b5f59" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${gradient})`} />
      <circle cx="304" cy="256" r="100" fill="none" stroke="#a7dcd6" strokeWidth="40" />
      <circle cx="208" cy="256" r="100" fill="none" stroke="#ffffff" strokeWidth="40" />
      <path d="M242.4 177.2A100 100 0 0 1 273.1 160.9" fill="none" stroke="#117d76" strokeWidth="60" />
      <path d="M227.4 191.7A100 100 0 0 1 293.5 156.5" fill="none" stroke="#a7dcd6" strokeWidth="40" />
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
