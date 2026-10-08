"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import HelpContent from "@/components/help/HelpContent";

export default function HelpPage() {
  const t = useTranslations("Help");
  const router = useRouter();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <div className="mb-6 flex items-start gap-2">
        <button
          onClick={() => router.back()}
          aria-label={t("close")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("intro")}</p>
        </div>
      </div>
      <HelpContent />
    </div>
  );
}
