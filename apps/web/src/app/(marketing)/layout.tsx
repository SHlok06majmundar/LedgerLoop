import Link from 'next/link';
import { Logo } from '@/components/brand';
import { MobileNav } from '@/components/marketing/mobile-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link href="/register">Start free</Link>
            </Button>
            <MobileNav items={NAV} />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid content-start gap-3">
            <Logo />
            <p className="text-sm text-muted-foreground">
              Receivables, reconciled. Built for Indian businesses that sell on credit.
            </p>
          </div>
          {[
            { title: 'Product', links: [['Features', '/features'], ['Pricing', '/pricing'], ['Mobile app', '/features#mobile']] },
            { title: 'Company', links: [['Contact', '/contact'], ['Sign in', '/login'], ['Create account', '/register']] },
            { title: 'Trust', links: [['Security', '/features#security'], ['Audit trail', '/features#audit']] },
          ].map((col) => (
            <div key={col.title} className="grid content-start gap-2 text-sm">
              <p className="font-medium">{col.title}</p>
              {col.links.map(([label, href]) => (
                <Link key={href} href={href!} className="text-muted-foreground hover:text-foreground">
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <p className="border-t py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LedgerLoop. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
