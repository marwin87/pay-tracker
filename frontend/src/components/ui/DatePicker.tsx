"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import Calendar, { useToday } from "@/components/ui/Calendar";
import CalendarPopup from "@/components/ui/CalendarPopup";
import { formatDate } from "@/lib/calendar";

interface Props {
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  /** Days outside [min, max] are disabled and month navigation stops at their months. */
  min?: string;
  max?: string;
  /** Trigger label without the year (for dates that recur every year). */
  hideYear?: boolean;
}

const ymOf = (iso: string) => iso.slice(0, 7);

export default function DatePicker({ value, onChange, min, max, hideYear }: Props) {
  const locale = useLocale();
  const today = useToday();
  // Open on the selection, or the nearest reachable month when it lies outside the bounds
  const home = () => {
    const ym = ymOf(value);
    return min && ym < ymOf(min) ? ymOf(min) : max && ym > ymOf(max) ? ymOf(max) : ym;
  };
  const [view, setView] = useState(home);
  const [y, m, d] = value.split("-").map(Number);

  // A single reachable month needs no arrows
  const nav = min && max && ymOf(min) === ymOf(max)
    ? undefined
    : { onChange: setView, min: min && ymOf(min), max: max && ymOf(max) };

  return (
    <CalendarPopup
      onToggle={() => setView(home())}
      label={formatDate(locale, y, m, d, hideYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" })}
    >
      {(close) => (
        <Calendar
          year={Number(view.slice(0, 4))}
          month={Number(view.slice(5, 7))}
          today={today}
          selected={value}
          title
          nav={nav}
          getDay={(iso) => ({ disabled: (!!min && iso < min) || (!!max && iso > max) })}
          onSelect={(iso) => { onChange(iso); close(); }}
        />
      )}
    </CalendarPopup>
  );
}
