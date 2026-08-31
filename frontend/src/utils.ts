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

export interface InvoiceTotalsItemInput {
  qty: number | string;
  price: number | string;
  // Issue #33: vat_rate lives per line item now (mixing 19%/7% lines on one
  // invoice is normal for this business), not once per invoice.
  vat_rate: number | string;
}

export interface InvoiceTotalsInput {
  // Null on a still-unissued draft (see types.ts's Invoice.is_kleinunternehmer).
  // Callers displaying a draft's provisional totals should resolve this
  // against the current setting first (e.g. `inv.is_kleinunternehmer ??
  // settings.kleinunternehmer`) rather than relying on a snapshot that
  // doesn't exist yet — null is treated the same as false here.
  is_kleinunternehmer: boolean | null;
  items?: InvoiceTotalsItemInput[];
}

// One row of the printed §14 UStG breakdown table — a net subtotal and VAT
// amount for every distinct rate present among the invoice's items.
export interface VatBreakdownLine {
  vat_rate: number;
  net: number;
  vat: number;
}

export interface InvoiceTotals {
  net: number;
  vat: number;
  gross: number;
  // Grouped per distinct rate present on the invoice's items, sorted
  // highest rate first. Always empty for a Kleinunternehmer invoice (§19
  // UStG: no VAT breakdown at all, regardless of what rates the lines
  // happen to carry) — check this instead of `vat === 0` when deciding
  // whether to render a breakdown, since a non-Kleinunternehmer invoice can
  // legitimately have a 0% line without being exempt.
  breakdown: VatBreakdownLine[];
}

// Input for computeInvoiceStats: everything invoiceTotals needs, plus the
// status/paid_date fields that decide which bucket (paid this year / open)
// an invoice falls into.
export interface InvoiceStatsInput extends InvoiceTotalsInput {
  status: string;
  paid_date: string | null;
}

export interface InvoiceStats {
  income: number;
  vatCollected: number;
  openSum: number;
  revenueThisYearGross: number;
  paidThisYearCount: number;
  openInvoicesCount: number;
}

// Dashboard.tsx's revenue/VAT/open-balance/threshold aggregation, pulled
// out into one pure function so there is exactly one place — not one per
// stat card — that decides which invoices count. A "storniert" (cancelled)
// invoice is excluded up front (issue #26): §14c UStG forbids simply
// deleting an issued invoice, so cancellation is the only way its amount
// stops counting here, and every stat below must actually honor that
// rather than relying on it happening to never match "offen"/"bezahlt".
export function computeInvoiceStats(invoices: InvoiceStatsInput[], year: number): InvoiceStats {
  const active = invoices.filter((i) => i.status !== "storniert");
  const paidThisYear = active.filter((i) => i.status === "bezahlt" && i.paid_date && isoYear(i.paid_date) === year);
  const openInvoices = active.filter((i) => i.status === "offen");

  const income = paidThisYear.reduce((s, i) => s + invoiceTotals(i).net, 0);
  const vatCollected = paidThisYear.reduce((s, i) => s + invoiceTotals(i).vat, 0);
  const openSum = openInvoices.reduce((s, i) => s + invoiceTotals(i).gross, 0);
  const revenueThisYearGross = paidThisYear.reduce((s, i) => s + invoiceTotals(i).gross, 0);

  return {
    income,
    vatCollected,
    openSum,
    revenueThisYearGross,
    paidThisYearCount: paidThisYear.length,
    openInvoicesCount: openInvoices.length,
  };
}

export function invoiceTotals(inv: InvoiceTotalsInput): InvoiceTotals {
  const items = inv.items || [];
  const net = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);

  if (inv.is_kleinunternehmer) {
    return { net, vat: 0, gross: net, breakdown: [] };
  }

  const byRate = new Map<number, { net: number; vat: number }>();
  for (const it of items) {
    const rate = Number(it.vat_rate) || 0;
    const lineNet = (Number(it.qty) || 0) * (Number(it.price) || 0);
    const entry = byRate.get(rate) || { net: 0, vat: 0 };
    entry.net += lineNet;
    entry.vat += (lineNet * rate) / 100;
    byRate.set(rate, entry);
  }
  const breakdown: VatBreakdownLine[] = Array.from(byRate.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([vat_rate, { net: rateNet, vat: rateVat }]) => ({ vat_rate, net: rateNet, vat: rateVat }));
  const vat = breakdown.reduce((s, b) => s + b.vat, 0);

  return { net, vat, gross: net + vat, breakdown };
}
