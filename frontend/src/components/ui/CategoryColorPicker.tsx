"use client";

import { CATEGORY_COLORS, CATEGORY_COLOR_SWATCH, type CategoryColor } from "@/lib/categories";

function ColorSwatch({
  color,
  selected,
  onChange,
}: {
  color: CategoryColor;
  selected: boolean;
  onChange: (color: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(color)}
      aria-label={color}
      className={`h-6 w-6 shrink-0 rounded-full ${CATEGORY_COLOR_SWATCH[color]} ${
        selected
          ? "ring-2 ring-offset-2 ring-slate-600 dark:ring-slate-300 dark:ring-offset-slate-800"
          : ""
      }`}
    />
  );
}

// Unused colors first (so a category reaches for a fresh one), grouped under
// their own labels — same grouping whether adding or editing.
export function ColorPicker({
  value,
  onChange,
  usedColors,
  newLabel,
  usedLabel,
}: {
  value: string;
  onChange: (color: string) => void;
  usedColors: Set<string>;
  newLabel: string;
  usedLabel: string;
}) {
  const unused = CATEGORY_COLORS.filter((c) => !usedColors.has(c));
  const used = CATEGORY_COLORS.filter((c) => usedColors.has(c));
  return (
    <div className="space-y-2.5">
      {unused.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
            {newLabel}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unused.map((color) => (
              <ColorSwatch key={color} color={color} selected={value === color} onChange={onChange} />
            ))}
          </div>
        </div>
      )}
      {used.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
            {usedLabel}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {used.map((color) => (
              <ColorSwatch key={color} color={color} selected={value === color} onChange={onChange} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
