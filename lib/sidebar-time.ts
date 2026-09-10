import type { Locale } from "./i18n/types";

export function formatCompactSidebarTime(
  date: Date | string,
  locale: Locale,
  now = new Date(),
): string {
  const target = date instanceof Date ? date : new Date(date);
  const elapsedMs = Math.max(0, now.getTime() - target.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return locale === "zh-CN" ? "刚刚" : "now";
  if (minutes < 60) return locale === "zh-CN" ? `${minutes}分钟前` : `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "zh-CN" ? `${hours}小时前` : `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return locale === "zh-CN" ? `${days}天前` : `${days}d`;

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(target.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(target);
}
