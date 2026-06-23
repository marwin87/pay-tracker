import { APP_VERSION, CONTACT_EMAIL } from "@/lib/app-config";

export default function AppFooter() {
  return (
    <footer className="fixed bottom-3 right-4 z-50 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="hover:text-green-600 dark:hover:text-green-400 transition-colors"
      >
        Contact me
      </a>
      <span aria-hidden="true">·</span>
      <span>{APP_VERSION}</span>
    </footer>
  );
}
