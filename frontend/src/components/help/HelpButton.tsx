"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import HelpSheet from "@/components/help/HelpSheet";

/** "?" button for a page header; opens the FAQ. */
export default function HelpButton() {
  const t = useTranslations("Help");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          // A phone gets a full page (back arrow, room for the keyboard); a bigger screen a dialog.
          window.matchMedia("(max-width: 639px)").matches ? router.push("/dashboard/help") : setOpen(true)
        }
        aria-haspopup="dialog"
        aria-label={t("button")}
        title={t("button")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-green-700 dark:hover:bg-green-900/20 dark:hover:text-green-400"
      >
        <CircleHelp size={18} />
      </button>
      {open && <HelpSheet onClose={() => setOpen(false)} />}
    </>
  );
}
