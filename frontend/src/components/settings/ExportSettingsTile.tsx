"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  EXPORT_FIELD_KEYS,
  MANDATORY_EXPORT_FIELDS,
  updateMe,
  type ExportFieldKey,
  type UserProfile,
} from "@/lib/user-api";
import { Switch } from "@/components/ui/Switch";
import { Checkbox } from "@/components/ui/Checkbox";
import { Tile } from "./Tile";

export function ExportSettingsTile({
  profile,
  onProfileUpdate,
  t,
}: {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const tp = useTranslations("SettingsPage");
  const [enabled, setEnabled] = useState(profile.export_enabled);
  const [fields, setFields] = useState<ExportFieldKey[]>(profile.export_fields);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [savingField, setSavingField] = useState<ExportFieldKey | null>(null);

  async function toggleEnabled(value: boolean) {
    setEnabled(value);
    setIsTogglingEnabled(true);
    try {
      onProfileUpdate(await updateMe({ export_enabled: value }));
    } catch {
      setEnabled(!value);
    } finally {
      setIsTogglingEnabled(false);
    }
  }

  async function toggleField(key: ExportFieldKey, checked: boolean) {
    const previous = fields;
    const next = checked ? [...fields, key] : fields.filter((f) => f !== key);
    setFields(next);
    setSavingField(key);
    try {
      onProfileUpdate(await updateMe({ export_fields: next }));
    } catch {
      setFields(previous);
    } finally {
      setSavingField(null);
    }
  }

  return (
    <Tile
      color="teal"
      icon={FileSpreadsheet}
      title={tp("excelExport.title")}
      description={tp("excelExport.description")}
      t={t}
    >
      <Switch
        checked={enabled}
        onChange={toggleEnabled}
        label={tp("excelExport.toggleLabel")}
        disabled={isTogglingEnabled}
      />

      <fieldset disabled={!enabled} className={!enabled ? "opacity-50" : ""}>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {tp("excelExport.fieldsHeading")}
        </p>
        <div className="space-y-2">
          {EXPORT_FIELD_KEYS.map((key) => {
            const mandatory = MANDATORY_EXPORT_FIELDS.includes(key);
            return (
              <Checkbox
                key={key}
                checked={fields.includes(key)}
                onChange={(checked) => toggleField(key, checked)}
                disabled={mandatory || savingField === key}
                label={
                  mandatory
                    ? `${tp(`excelExport.fields.${key}`)} ${tp("excelExport.requiredSuffix")}`
                    : tp(`excelExport.fields.${key}`)
                }
              />
            );
          })}
        </div>
      </fieldset>
    </Tile>
  );
}
