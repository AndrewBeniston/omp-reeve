export function quickChatDate(date: string, locale: string, today: string, yesterday: string, now = new Date()): string {
  const value = new Date(date);
  if (!Number.isFinite(value.getTime())) return "";
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(now) - day(value)) / 86_400_000);
  if (days === 0) return today;
  if (days === 1) return yesterday;
  if (days > 1 && days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(value);
}
