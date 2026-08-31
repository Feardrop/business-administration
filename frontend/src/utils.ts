import type { Lang } from "./types";

// Canonical keys, stored as-is in the DB (see expenses.categories in the i18n
// locale files for display labels) — translate the label, never the key.
export const EXPENSE_CATEGORIES = [
  "equipment",
  "software",
  "travel",
  "insurance",
  "rent",
  "training",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const LOCALE_BY_LANG: Record<Lang, string> = { de: "de-DE", en: "en-US" };

function localeFor(lang: Lang): string {
  return LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.de;
}

export function fmtEUR(n: number | string | null | undefined, lang: Lang = "de"): string {
  const num = Number(n) || 0;
  return new Intl.NumberFormat(localeFor(lang), { style: "currency", currency: "EUR" }).format(num);
}

export function fmtDate(iso: string | null | undefined, lang: Lang = "de"): string {
  if (!iso) return "–";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(localeFor(lang), { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function currentYear(): number {
  return new Date().getFullYear();
}

export function isoYear(iso: string | null | undefined): number {
  return Number(iso?.slice(0, 4));
}

export interface InvoiceTotalsInput {
  // Null on a still-unissued draft (see types.ts's Invoice.is_kleinunternehmer).
  // Callers displaying a draft's provisional totals should resolve this
  // against the current setting first (e.g. `inv.is_kleinunternehmer ??
  // settings.kleinunternehmer`) rather than relying on a snapshot that
  // doesn't exist yet — null is treated the same as false here.
  is_kleinunternehmer: boolean | null;
  vat_rate: number | string;
  items?: { qty: number | string; price: number | string }[];
}

export interface InvoiceTotals {
  net: number;
  vat: number;
  gross: number;
}

export function invoiceTotals(inv: InvoiceTotalsInput): InvoiceTotals {
  const net = (inv.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const vat = inv.is_kleinunternehmer ? 0 : (net * (Number(inv.vat_rate) || 0)) / 100;
  return { net, vat, gross: net + vat };
}
