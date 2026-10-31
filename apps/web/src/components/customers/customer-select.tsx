'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Input, NativeSelect } from '@/components/ui/input';
import { api, apiPage } from '@/lib/api';
import { useOrgQueryKey } from '@/lib/hooks';
import type { Customer } from '@/lib/types';

/** Search-then-pick customer selector backed by the customers API. */
export function CustomerSelect({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (customer: Customer | null) => void;
  invalid?: boolean;
}) {
  const [search, setSearch] = useState('');
  const { data } = useQuery({
    queryKey: useOrgQueryKey('customers', 'picker', search),
    queryFn: () => apiPage<Customer>('/customers', { query: { search, limit: 50, sort: 'name', order: 'asc' } }),
    placeholderData: (prev) => prev,
  });
  const selected = useQuery({
    queryKey: useOrgQueryKey('customers', value),
    queryFn: () => api<Customer>(`/customers/${value}`),
    enabled: Boolean(value),
  });
  const options = data?.items ?? [];
  const withSelected =
    selected.data && !options.some((o) => o.id === selected.data.id) ? [selected.data, ...options] : options;

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
      <Input
        type="search"
        placeholder="Search customers"
        aria-label="Search customers"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <NativeSelect
        id={id}
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(withSelected.find((c) => c.id === e.target.value) ?? null)}
      >
        <option value="">Select a customer…</option>
        {withSelected.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.gstin ? ` · ${c.gstin}` : ''}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
