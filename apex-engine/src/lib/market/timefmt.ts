/**
 * Time-axis formatting with timezone support (incl. DST via Intl). Pure so it
 * is unit-testable; "local" omits the timeZone option (browser-local clocks,
 * including its DST rules).
 */

export interface OffsetHours {
  label: string;
  zone: string; // IANA name, or "UTC+H" for fixed offsets
}

export const TIMEZONE_OPTIONS: OffsetHours[] = [
  { label: "本机时间", zone: "local" },
  { label: "UTC", zone: "UTC" },
  { label: "UTC+8（北京/新加坡/港股）", zone: "Etc/GMT-8" },
  { label: "UTC+3", zone: "Etc/GMT-3" },
  { label: "UTC+1（中欧）", zone: "Etc/GMT-1" },
  { label: "UTC-5（美东，含夏令时）", zone: "America/New_York" },
  { label: "UTC-8（美西，含夏令时）", zone: "America/Los_Angeles" },
];

export function formatTime(sec: number, zone: string): string {
  if (!Number.isFinite(sec)) return "—";
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone === "local" ? undefined : zone,
  };
  // "en-GB" renders 24h "HH:MM"; keep it stable across locales.
  return new Intl.DateTimeFormat("en-GB", opts).format(sec * 1000);
}

export function formatDateTime(
  sec: number,
  zone: string,
  withDate = true,
): string {
  if (!Number.isFinite(sec)) return "—";
  const opts: Intl.DateTimeFormatOptions = {
    ...(withDate ? { year: "numeric", month: "2-digit", day: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone === "local" ? undefined : zone,
  };
  return new Intl.DateTimeFormat("en-GB", opts).format(sec * 1000);
}
