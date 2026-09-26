import type { Category } from "./categories-api";
import type { PaymentInstanceOut, TrendPoint } from "./payments-api";

export interface CategoryTotal {
  category: Category;
  total: number;
  paid: number;
}

export interface MonthSummary {
  paid: number;
  overdue: number;
  upcoming: number;
  paidCount: number;
  overdueCount: number;
  upcomingCount: number;
  byCategory: CategoryTotal[]; // largest first
}

/** What was actually paid, else the expected amount. */
function paidValue(p: PaymentInstanceOut): number {
  return parseFloat(p.paid_amount ?? p.amount);
}

/** Totals for one currency — amounts in different currencies are never added. */
export function summarize(instances: PaymentInstanceOut[], currency: string): MonthSummary {
  const s: MonthSummary = {
    paid: 0, overdue: 0, upcoming: 0, paidCount: 0, overdueCount: 0, upcomingCount: 0, byCategory: [],
  };
  const cats = new Map<number, CategoryTotal>();
  for (const p of instances) {
    if (p.currency !== currency) continue;
    const value = p.status === "paid" ? paidValue(p) : parseFloat(p.amount);
    if (p.status === "paid") { s.paid += value; s.paidCount++; }
    else if (p.status === "overdue") { s.overdue += value; s.overdueCount++; }
    else { s.upcoming += value; s.upcomingCount++; }
    const row = cats.get(p.category.id) ?? { category: p.category, total: 0, paid: 0 };
    row.total += value;
    if (p.status === "paid") row.paid += value;
    cats.set(p.category.id, row);
  }
  s.byCategory = [...cats.values()].sort((a, b) => b.total - a.total);
  return s;
}

/** Currencies present in the data, most money first. */
export function currenciesByVolume(
  instances: PaymentInstanceOut[],
  trend: TrendPoint[],
): string[] {
  const vol = new Map<string, number>();
  for (const p of instances) vol.set(p.currency, (vol.get(p.currency) ?? 0) + parseFloat(p.amount));
  for (const t of trend) {
    vol.set(t.currency, (vol.get(t.currency) ?? 0) + parseFloat(t.paid) + parseFloat(t.unpaid));
  }
  return [...vol.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/** The user's default currency when it has data, else the biggest one. */
export function pickCurrency(
  selected: string | null,
  currencies: string[],
  defaultCurrency: string | null,
): string | null {
  if (selected && currencies.includes(selected)) return selected;
  if (defaultCurrency && currencies.includes(defaultCurrency)) return defaultCurrency;
  return currencies[0] ?? null;
}

export function formatMoney(value: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${Math.round(value)} ${currency}`; // custom code Intl doesn't know
  }
}

/** The 12 "YYYY-MM" periods ending at `month`, oldest first (mirrors the backend). */
export function trendPeriods(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const end = y * 12 + m - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const idx = end - 11 + i;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}
