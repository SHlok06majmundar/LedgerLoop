'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

export function MobileNav({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </DialogTrigger>
      <DialogContent title="Menu">
        <nav className="grid gap-1" aria-label="Mobile">
          {[...items, { href: '/login', label: 'Sign in' }].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-base hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
          <Button asChild className="mt-2">
            <Link href="/register" onClick={() => setOpen(false)}>
              Start free
            </Link>
          </Button>
        </nav>
      </DialogContent>
    </Dialog>
  );
}
