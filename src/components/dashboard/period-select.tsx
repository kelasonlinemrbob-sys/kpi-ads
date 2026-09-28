import { CalendarDaysIcon } from "lucide-react";
import { UrlSelect } from "./url-select";

export function PeriodSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  return (
    <UrlSelect
      param="period"
      value={value}
      options={options}
      label="Period"
      className="min-w-44"
      icon={<CalendarDaysIcon className="size-4 text-foreground/70" />}
    />
  );
}
