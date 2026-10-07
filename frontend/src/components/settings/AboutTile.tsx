"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tile, type TileColor } from "@/components/settings/Tile";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

// Add entries here (e.g. privacy policy, terms); the links section stays hidden while empty.
const LINKS: { label: string; href: string }[] = [];

export function AboutTile({
  color,
  t,
}: {
  color: TileColor;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Tile color={color} icon={Info} title={t("about.title")} description={t("about.description")} t={t}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t("about.text")}</p>
      <p className="text-sm text-slate-700 dark:text-slate-200">
        {t("about.version")}: <span className="font-medium">{APP_VERSION}</span>
      </p>
      {LINKS.length > 0 && (
        <ul className="space-y-1 text-sm">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-700 underline hover:text-green-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
