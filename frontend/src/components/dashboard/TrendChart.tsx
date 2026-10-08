"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { formatMoney, trendPeriods } from "@/lib/summary";
import type { TrendPoint } from "@/lib/payments-api";
import { CARD_CLASS } from "./MonthSummaryCard";

const W = 640;
const H = 240;
const LEFT = 8;
const TOP = 12;
const BASE = 205;

/** A round upper bound for the y axis (1, 2, 2.5, 5 × 10^n). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

interface Props {
  points: TrendPoint[];
  currency: string;
  /** Last month of the window, "YYYY-MM". */
  month: string;
}

export default function TrendChart({ points, currency, month }: Props) {
  const t = useTranslations("Dashboard.trend");
  const locale = useLocale();
  const { decimalSeparator } = useAppLocale();
  const money = (v: number) => formatMoney(v, currency, locale, decimalSeparator);
  const [active, setActive] = useState<number | null>(null);

  const periods = trendPeriods(month);
  const bars = periods.map((period) => {
    const pt = points.find((p) => p.period === period && p.currency === currency);
    const paid = pt ? parseFloat(pt.paid) : 0;
    const unpaid = pt ? parseFloat(pt.unpaid) : 0;
    return { period, paid, unpaid, total: paid + unpaid };
  });
  const filled = bars.filter((b) => b.total > 0);
  const avg = filled.length ? filled.reduce((s, b) => s + b.total, 0) / filled.length : 0;
  const max = niceMax(Math.max(...bars.map((b) => b.total), avg));
  const y = (v: number) => BASE - (v / max) * (BASE - TOP);
  const step = (W - LEFT * 2) / bars.length;
  const monthName = (period: string, style: "short" | "long") => {
    const [yy, mm] = period.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, style === "short" ? { month: "short" } : { month: "long", year: "numeric" }).format(new Date(yy, mm - 1));
  };

  const shown = bars[active ?? bars.length - 1];
  const diff = shown.total - avg;

  return (
    <section className={CARD_CLASS} aria-labelledby="trend-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="trend-title" className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {t("title")}
        </h2>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t("paid")}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-400" />{t("unpaid")}</span>
          {avg > 0 && <span>{t("average", { amount: money(avg) })}</span>}
        </span>
      </div>

      {filled.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("empty")}</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label={t("chartLabel")}>
            <line x1={LEFT} x2={W - LEFT} y1={BASE} y2={BASE} className="stroke-slate-200 dark:stroke-slate-700" />
            {bars.map((b, i) => {
              const bw = step * 0.62;
              const x = LEFT + i * step + (step - bw) / 2;
              const isSel = i === (active ?? bars.length - 1);
              const dim = isSel ? 1 : 0.45;
              return (
                <g
                  key={b.period}
                  tabIndex={0}
                  role="button"
                  aria-label={`${monthName(b.period, "long")}: ${money(b.total)}`}
                  className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-green-500"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                >
                  <rect x={LEFT + i * step} y={TOP} width={step} height={BASE - TOP + 24} rx={6} strokeWidth={2}
                    className={`stroke-transparent ${isSel ? "fill-slate-100 dark:fill-slate-700/60" : "fill-transparent"}`} />
                  {b.paid > 0 && (
                    <rect x={x} y={y(b.paid)} width={bw} height={BASE - y(b.paid)} rx={2}
                      className="fill-emerald-500 dark:fill-emerald-600" opacity={dim} />
                  )}
                  {b.unpaid > 0 && (
                    <rect x={x} y={y(b.total)} width={bw} height={y(b.paid) - y(b.total)} rx={2}
                      className="fill-blue-400 dark:fill-blue-500" opacity={dim} />
                  )}
                  <text x={x + bw / 2} y={BASE + 22} textAnchor="middle"
                    className={`text-[20px] sm:text-[11px] ${isSel ? "fill-slate-800 font-bold dark:fill-slate-100" : "fill-slate-400 dark:fill-slate-500"}`}>
                    {monthName(b.period, "short")}
                  </text>
                </g>
              );
            })}
            {avg > 0 && (
              <line x1={LEFT} x2={W - LEFT} y1={y(avg)} y2={y(avg)} strokeDasharray="4 4"
                className="pointer-events-none stroke-slate-500 dark:stroke-slate-400" opacity={0.6} />
            )}
          </svg>

          <div className="mt-3 flex min-h-11 flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-700" aria-live="polite">
            <span className="font-medium text-slate-800 dark:text-slate-100">{monthName(shown.period, "long")}</span>
            <span className="tabular-nums text-slate-800 dark:text-slate-100">{money(shown.total)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t("detail", { paid: money(shown.paid), unpaid: money(shown.unpaid) })}
            </span>
            {shown.total > 0 && avg > 0 && (
              <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
                {t(diff >= 0 ? "above" : "below", { amount: money(Math.abs(diff)) })}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
