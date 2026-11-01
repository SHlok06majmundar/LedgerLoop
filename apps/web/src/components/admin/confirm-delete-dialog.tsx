'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';

/** Destructive confirmation that asks for the record's name to be typed first. */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  actionLabel,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string;
  actionLabel: string;
  loading?: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const close = (next: boolean) => {
    if (!next) setTyped('');
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={title} description={description}>
        <Field label={`Type "${confirmText}" to confirm`} htmlFor="confirm-delete">
          <Input id="confirm-delete" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={typed.trim() !== confirmText} loading={loading} onClick={onConfirm}>
            <Trash2 /> {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
