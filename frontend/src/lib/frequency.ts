import { useTranslations } from "next-intl";
import type { BillFrequency } from "./bills-api";

/** Label like "Monthly", "Every 3 months", "Every 2 years" for a frequency + interval. */
export function useFrequencyLabel() {
  const t = useTranslations("Frequencies");
  return (frequency: BillFrequency, interval: number): string => {
    if (frequency === "one_off" || interval <= 1) return t(frequency === "one_off" ? "one_off" : frequency);
    const unit = frequency === "annual" ? "years" : "months";
    return t("every", { period: t(unit, { count: interval }) });
  };
}
