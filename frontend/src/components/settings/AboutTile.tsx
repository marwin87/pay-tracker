"use client";

import { ChevronRight, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tile, type TileColor } from "@/components/settings/Tile";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

// Direct runtime dependencies and shipped fonts; update when adding or removing one (PDF fonts: backend/app/assets/fonts/LICENSES.txt).
const LICENSES: { group: string; items: [name: string, license: string][] }[] = [
  {
    group: "Frontend",
    items: [
      ["Next.js", "MIT"],
      ["React, React DOM", "MIT"],
      ["next-intl", "MIT"],
      ["lucide-react", "ISC"],
      ["Tailwind CSS", "MIT"],
    ],
  },
  {
    group: "Backend",
    items: [
      ["FastAPI", "MIT"],
      ["Starlette, Uvicorn", "BSD-3-Clause"],
      ["SQLAlchemy, Alembic", "MIT"],
      ["Pydantic", "MIT"],
      ["pandas", "BSD-3-Clause"],
      ["openpyxl", "MIT"],
      ["fpdf2", "LGPL-3.0"],
      ["psycopg2", "LGPL-3.0"],
      ["bcrypt", "Apache-2.0"],
      ["python-jose", "MIT"],
      ["python-multipart", "Apache-2.0"],
      ["APScheduler", "MIT"],
      ["Apprise", "BSD-2-Clause"],
      ["tzdata", "Apache-2.0"],
      ["PostgreSQL", "PostgreSQL License"],
    ],
  },
  {
    group: "Fonts",
    items: [
      ["DejaVu Sans", "Bitstream Vera License"],
      ["Noto Sans SC", "SIL OFL 1.1"],
      ["Geist, Geist Mono", "SIL OFL 1.1"],
      ["Cinzel", "SIL OFL 1.1"],
    ],
  },
];

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
      <details className="group rounded-lg border border-slate-200 dark:border-slate-700">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-green-600 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} className="shrink-0 text-slate-400 transition-transform group-open:rotate-90 dark:text-slate-500" />
          {t("about.licensesTitle")}
        </summary>
        <p className="px-3.5 pb-2 text-sm text-slate-500 dark:text-slate-400">{t("about.licensesText")}</p>
        <div className="overflow-x-auto px-1.5 pb-2">
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {LICENSES.map(({ group, items }) => (
                <GroupRows key={group} group={group} items={items} />
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Tile>
  );
}

function GroupRows({ group, items }: { group: string; items: [string, string][] }) {
  return (
    <>
      <tr>
        <th
          colSpan={2}
          className="bg-slate-100 px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-700/40 dark:text-slate-400"
        >
          {group}
        </th>
      </tr>
      {items.map(([name, license]) => (
        <tr key={name} className="border-b border-slate-200 last:border-0 dark:border-slate-700">
          <td className="px-2.5 py-1.5 font-medium text-slate-800 dark:text-slate-100">{name}</td>
          <td className="whitespace-nowrap px-2.5 py-1.5 text-slate-600 dark:text-slate-300">{license}</td>
        </tr>
      ))}
    </>
  );
}
