"use client";

import Dropdown from "@/components/ui/Dropdown";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  ariaLabel: string;
}

export default function FilterSelect({ value, onChange, options, ariaLabel }: Props) {
  return (
    <Dropdown
      variant="pill-sm"
      value={value}
      onChange={onChange}
      options={options}
      ariaLabel={ariaLabel}
    />
  );
}
