export const CATEGORY_ORDER = [
  "education",
  "entertainment",
  "healthcare",
  "housing",
  "insurance",
  "subscriptions",
  "transport",
  "utilities",
  "other",
] as const;

type BillCategory = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_BORDER: Record<BillCategory, string> = {
  education:     "border-l-blue-400 dark:border-l-blue-500",
  entertainment: "border-l-purple-400 dark:border-l-purple-500",
  healthcare:    "border-l-rose-400 dark:border-l-rose-500",
  housing:       "border-l-orange-400 dark:border-l-orange-500",
  insurance:     "border-l-slate-400 dark:border-l-slate-500",
  subscriptions: "border-l-violet-400 dark:border-l-violet-500",
  transport:     "border-l-cyan-500 dark:border-l-cyan-400",
  utilities:     "border-l-emerald-400 dark:border-l-emerald-500",
  other:         "border-l-slate-300 dark:border-l-slate-600",
};
