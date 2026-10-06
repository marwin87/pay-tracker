"use client";

import { ChevronDown, Clock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { updateMe, type UserProfile } from "@/lib/user-api";
import { useLocale } from "@/context/locale-context";
import { browserTimeZone, supportedTimeZones } from "@/lib/today";
import { btnSaveClass as btnSave, btnCancelClass as btnCancel } from "@/components/ui/formButtonClasses";
import { usePopupPosition } from "@/components/ui/usePopupPosition";
import { Tile } from "./Tile";
import { useToast } from "@/context/toast-context";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

/** "America/New_York" -> "america/new york", so typing "new york" finds it. */
function normalize(zone: string): string {
  return zone.toLowerCase().replace(/_/g, " ");
}

/**
 * Searchable list of zones. Not a native <datalist>: that filters by what is already
 * typed, so with a zone filled in its arrow opens a list of that one zone.
 * Opening shows every zone (the current one highlighted); typing narrows the list.
 */
function TimeZonePicker({
  value,
  onChange,
  zones,
  ariaLabel,
  placeholder,
  noMatches,
  committed,
  error,
}: {
  value: string;
  onChange: (zone: string) => void;
  zones: string[];
  ariaLabel: string;
  placeholder: string;
  noMatches: string;
  committed: string; // the saved zone: what the list highlights while not searching
  error?: string | null; // shown under the field once the list is closed
}) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const query = normalize(value.trim());
  const shown = useMemo(
    () => (searching && query ? zones.filter((z) => normalize(z).includes(query)) : zones),
    [zones, searching, query],
  );

  function close() {
    setOpen(false);
    setSearching(false);
  }
  usePopupPosition({ open, triggerRef: inputRef, popupRef, onClose: close, width: "exact" });

  // Close on a click outside, like the shared Dropdown
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !popupRef.current?.contains(target)) close();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Keep the highlighted option in view
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active, shown]);

  function openList() {
    if (open) return;
    setSearching(false);
    setActive(Math.max(0, zones.indexOf(value.trim() || committed)));
    setOpen(true);
  }

  function choose(zone: string) {
    onChange(zone);
    setOpen(false);
    setSearching(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setSearching(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      const n = shown.length;
      if (n) setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === "Enter" && open && shown[active]) {
      e.preventDefault();
      choose(shown[active]);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls="time-zone-list"
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setSearching(true);
          setActive(0);
          setOpen(true);
        }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        maxLength={64}
        className={`${inputClass} pr-9`}
      />
      <ChevronDown
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
      />
      {error && !open && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {open && createPortal(
        <div ref={popupRef} className="fixed rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {shown.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{noMatches}</p>
          ) : (
            <ul
              id="time-zone-list"
              ref={listRef}
              role="listbox"
              // keep the input focused while an option is clicked
              onMouseDown={(e) => e.preventDefault()}
              className="max-h-64 overflow-y-auto"
            >
              {shown.map((zone, i) => (
                <li
                  key={zone}
                  role="option"
                  aria-selected={zone === value.trim()}
                  onClick={() => choose(zone)}
                  className={`cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors ${
                    zone === value.trim()
                      ? "bg-green-700 font-semibold text-white"
                      : i === active
                        ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        : "text-slate-700 hover:bg-green-50 hover:text-green-800 dark:text-slate-300 dark:hover:bg-green-900/30 dark:hover:text-green-300"
                  }`}
                >
                  {zone}
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function TimeZoneTile({
  profile,
  onProfileUpdate,
  onDirtyChange,
  t,
  isCollapsed,
  onToggle,
}: {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
  onDirtyChange: (dirty: boolean) => void;
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const tp = useTranslations("SettingsPage");
  const showToast = useToast();
  const { setTimeZone } = useLocale();

  const zones = useMemo(() => supportedTimeZones(), []);
  const [zone, setZone] = useState(profile.timezone);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const trimmed = zone.trim();
  // Without supportedValuesOf (old browser) accept the text and let the server judge
  const isKnown = zones.length === 0 || zones.includes(trimmed);
  const isDirty = trimmed !== profile.timezone;
  const detected = browserTimeZone();

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  function cancel() {
    setZone(profile.timezone);
    setSaveError(null);
  }

  async function save() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateMe({ timezone: trimmed });
      onProfileUpdate(updated);
      setTimeZone(updated.timezone);
      showToast(tp("timeZoneSaved"));
    } catch {
      setSaveError(tp("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Tile
      color="purple"
      icon={Clock}
      title={tp("timeZone.title")}
      description={tp("timeZone.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <TimeZonePicker
        value={zone}
        onChange={setZone}
        zones={zones}
        ariaLabel={tp("timeZone.ariaLabel")}
        placeholder={tp("timeZone.placeholder")}
        noMatches={tp("timeZone.noMatches")}
        committed={profile.timezone}
        error={isDirty && !isKnown ? tp("timeZone.unknown") : null}
      />

      {detected !== trimmed && (
        <button
          type="button"
          onClick={() => setZone(detected)}
          className="text-xs font-medium text-green-700 hover:underline dark:text-emerald-400"
        >
          {tp("timeZone.useBrowser", { zone: detected })}
        </button>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">{tp("timeZone.hint")}</p>

      {saveError && (
        <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
      )}

      {isDirty && (
        <div className="flex gap-2 pt-1">
          <button onClick={cancel} disabled={isSaving} className={btnCancel}>
            {tp("cancel")}
          </button>
          <button onClick={save} disabled={isSaving || !isKnown} className={btnSave}>
            {isSaving ? tp("saving") : tp("save")}
          </button>
        </div>
      )}
    </Tile>
  );
}
