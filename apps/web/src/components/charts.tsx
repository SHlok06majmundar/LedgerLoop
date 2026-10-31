'use client';

import { Table2, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { compactMoney, money } from '@/lib/format';
import { Table, TBody, TD, TH, THead, TR } from './ui/table';

export interface SeriesDef {
  key: string;
  label: string;
  /** CSS variable holding the validated series colour. */
  color: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y!.slice(2)}`;
};

function MoneyTooltip({
  active,
  payload,
  label,
  series,
  labelFormat,
}: TooltipProps<number, string> & { series: SeriesDef[]; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{labelFormat ? labelFormat(String(label)) : label}</p>
      {series.map((s) => {
        const value = payload.find((p) => p.dataKey === s.key)?.value ?? 0;
        return (
          <p key={s.key} className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
            <span className="ml-auto pl-4 font-medium text-foreground tabular">{money(Number(value))}</span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * Bars over a category axis (months, aging buckets). One y-axis, thin bars with
 * rounded data-ends, 2px gaps, hover tooltip, legend when there are 2+ series,
 * and a table view so no value depends on colour alone.
 */
export function MoneyBarChart<T extends Record<string, string | number>>({
  data,
  xKey,
  series,
  xFormat,
  height = 260,
  title,
}: {
  data: T[];
  xKey: keyof T & string;
  series: SeriesDef[];
  xFormat?: (value: string) => string;
  height?: number;
  title: string;
}) {
  const [asTable, setAsTable] = useState(false);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <button
          onClick={() => setAsTable((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          aria-pressed={asTable}
        >
          {asTable ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
          {asTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {asTable ? (
        <Table aria-label={title}>
          <THead>
            <TR>
              <TH />
              {series.map((s) => (
                <TH key={s.key} className="text-right">
                  {s.label}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {data.map((row) => (
              <TR key={String(row[xKey])}>
                <TD>{xFormat ? xFormat(String(row[xKey])) : String(row[xKey])}</TD>
                {series.map((s) => (
                  <TD key={s.key} className="text-right tabular">
                    {money(Number(row[s.key]))}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <div style={{ height }} role="img" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
              <XAxis
                dataKey={xKey}
                tickFormatter={xFormat}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => compactMoney(v)}
                tickLine={false}
                axisLine={false}
                width={64}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                content={<MoneyTooltip series={series} labelFormat={xFormat} />}
              />
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                  stroke="var(--card)"
                  strokeWidth={1}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
