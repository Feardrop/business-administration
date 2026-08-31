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

// Canonical keys for the payment-method dropdown (issue #30), same
// stored-as-is/translate-the-label convention as EXPENSE_CATEGORIES
// above. The backend column is plain free text, so this is a UI
// convenience, not a hard constraint.
export const PAYMENT_METHODS = ["bank_transfer", "cash", "paypal", "other"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

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

// One recorded payment, as much of it as the functions below need --
// matches the shape of types.ts's Payment (issue #30). Replaces the old
// boolean Invoice.paid_date: `date` is the actual fix for cash-basis
// tax-year attribution (Zufluss-Prinzip: income counts in the year money
// was actually received, not the year it was typed into the app).
export interface PaymentLike {
  date: string;
  amount: number | string;
}

// Sum of every recorded payment on `inv`, regardless of date -- the
// actual cash received to date. Mirrors backend models.Invoice.amount_paid.
export function amountPaid(inv: { payments?: PaymentLike[] }): number {
  return (inv.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

// Remaining balance, floored at 0 so an overpayment (see isOverpaid) never
// shows as a nonsensical negative amount due.
export function amountDue(inv: InvoiceTotalsInput & { payments?: PaymentLike[] }): number {
  const due = invoiceTotals(inv).gross - amountPaid(inv);
  return due > 0 ? due : 0;
}

// True once recorded payments exceed the gross total -- a display flag
// only (issue #30 scope), not a refund workflow or Skonto handling.
export function isOverpaid(inv: InvoiceTotalsInput & { payments?: PaymentLike[] }): boolean {
  return amountPaid(inv) > invoiceTotals(inv).gross;
}

// Input for computeInvoiceStats: everything invoiceTotals needs, plus the
// status/payments fields that decide which bucket (paid this year / open)
// an invoice falls into.
export interface InvoiceStatsInput extends InvoiceTotalsInput {
  status: string;
  payments?: PaymentLike[];
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
//
// Issue #30: income/VAT are attributed by each *payment's own* date, not
// by the invoice's (removed) paid_date/status -- a December payment only
// entered into the app in March must still count as December's income.
// A partial payment's income/VAT are split proportionally to the share of
// the invoice's gross it settles, rather than crediting the whole
// invoice on its first (possibly partial) payment. "open" sums the
// remaining balance due (amountDue), not the full gross, for a
// "teilweise bezahlt" invoice.
export function computeInvoiceStats(invoices: InvoiceStatsInput[], year: number): InvoiceStats {
  const active = invoices.filter((i) => i.status !== "storniert");

  let income = 0;
  let vatCollected = 0;
  let revenueThisYearGross = 0;
  let paidThisYearCount = 0;

  for (const inv of active) {
    const totals = invoiceTotals(inv);
    const paymentsThisYear = (inv.payments || []).filter((p) => isoYear(p.date) === year);
    if (paymentsThisYear.length === 0) continue;
    paidThisYearCount += 1;
    for (const p of paymentsThisYear) {
      const amt = Number(p.amount) || 0;
      const ratio = totals.gross > 0 ? amt / totals.gross : 0;
      income += totals.net * ratio;
      vatCollected += totals.vat * ratio;
      revenueThisYearGross += amt;
    }
  }

  const openInvoices = active.filter((i) => i.status === "offen" || i.status === "teilweise bezahlt");
  const openSum = openInvoices.reduce((s, i) => s + amountDue(i), 0);

  return {
    income,
    vatCollected,
    openSum,
    revenueThisYearGross,
    paidThisYearCount,
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
