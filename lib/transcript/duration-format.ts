type DurationUnit = "day" | "hour" | "minute" | "second";

const UNITS: { unit: DurationUnit; seconds: number }[] = [
  { unit: "day", seconds: 86_400 },
  { unit: "hour", seconds: 3_600 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 },
];

/** Format elapsed milliseconds as locale-aware narrow units. */
export function formatDuration(milliseconds: number, locale?: string): string {
  const totalSeconds = Math.floor((Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0) / 1_000);
  let remainingSeconds = totalSeconds;
  const values = UNITS.flatMap(({ unit, seconds }) => {
    const value = Math.floor(remainingSeconds / seconds);
    remainingSeconds %= seconds;
    return value > 0 ? [{ unit, value }] : [];
  });

  if (values.length === 0) values.push({ unit: "second", value: 0 });

  const formatted = values.flatMap(({ unit, value }) => {
    const formatter = new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "narrow",
    });
    const isHungarian = formatter.resolvedOptions().locale.toLowerCase().startsWith("hu");
    const parts = formatter.formatToParts(value);
    const unitText = parts
      .filter((part) => !isHungarian || part.type !== "literal")
      .map((part) => part.value)
      .join("");
    return unitText ? [unitText] : [];
  });

  return formatted.join(" ") || "0s";
}
