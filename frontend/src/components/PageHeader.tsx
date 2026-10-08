import HelpButton from "@/components/help/HelpButton";

/** Title block shared by every dashboard page, so size and spacing never drift apart. */
export default function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      <HelpButton />
    </div>
  );
}
