// Mirrors backend/app/schemas.py. Decimal fields (money, quantities) are
// serialized by FastAPI/Pydantic as JSON strings in this app's actual
// responses (verified against a live /api/settings response), not numbers —
// keep these as `string` and convert with Number() at the call site, same
// as the existing utils.js/js components already did before this file
// existed.

export interface Settings {
  business_name: string;
  owner_name: string;
  address: string;
  tax_number: string;
  // Umsatzsteuer-Identifikationsnummer, separate from tax_number
  // (Steuernummer) — optional, since many small Kleingewerbe businesses
  // don't have one. Printed on the invoice only when set.
  ust_id_nr: string;
  iban: string;
  kleinunternehmer: boolean;
  prev_year_revenue: string;
  invoice_prefix: string;
}

export interface InvoiceItem {
  id: number;
  description: string;
  qty: string;
  price: string;
  // Per-line VAT rate (moved off Invoice in issue #33) — mixing 19%/7%
  // lines on one invoice is normal for this business.
  vat_rate: string;
}

export interface InvoiceItemInput {
  description: string;
  qty: number | string;
  price: number | string;
  vat_rate?: number | string;
}

// Full status lifecycle (see backend/app/schemas.py's InvoiceStatus
// comment / backend/app/models.py's Invoice docstring for the diagram):
//   draft --issue--> offen --pay--> bezahlt
//     |                 |
//     +--delete         +--cancel--> storniert                 (issue #26)
//     offen --partial payment--> teilweise bezahlt --(pay rest)--> bezahlt
//                                                                  (#30)
//     teilweise bezahlt --cancel--> storniert                     (#26)
// All five are produced by this app now that #26 and #30 have both
// landed. "offen"/"teilweise bezahlt"/"bezahlt" are derived server-side
// from the payment ledger (see Payment below) -- never set directly.
// "storniert" is terminal -- reached only via POST .../cancel[-and-correct],
// never by deleting or editing an issued invoice (§14c UStG), and never
// re-derived from payment state.
export type InvoiceStatus = "draft" | "offen" | "teilweise bezahlt" | "bezahlt" | "storniert";

// One entry in an invoice's payment ledger -- mirrors
// backend/app/schemas.py's PaymentOut. Replaces the old boolean
// Invoice.paid_date: `date` is the actual fix for the cash-basis
// tax-year attribution bug (Zufluss-Prinzip), since it defaults to today
// but is always user-overridable.
export interface Payment {
  id: number;
  invoice_id: number;
  date: string;
  amount: string;
  method: string;
  note: string | null;
}

// Payload for POST /api/invoices/{id}/payments -- mirrors
// backend/app/schemas.py's PaymentIn. `date` is optional; omitting it
// lets the backend default to today (still overridable by passing it).
export interface PaymentCreateInput {
  date?: string;
  amount: number | string;
  method?: string;
  note?: string;
}

export interface Invoice {
  id: number;
  // Null while status is "draft" — assigned once, at issue time, and
  // never changed again.
  number: string | null;
  date: string;
  client_name: string;
  client_address: string;
  // §14 Abs. 4 Nr. 6 UStG (issue #33): when the service was actually
  // rendered, which is not necessarily `date`. Exactly one of these two is
  // expected to be set — an exact day, or a free-text period like "August
  // 2026" for work invoiced later than it was performed. If both are
  // somehow set, service_date takes priority when printing.
  service_date: string | null;
  service_period_text: string | null;
  // Null while status is "draft" — snapshotted from settings at issue
  // time and immutable afterward.
  is_kleinunternehmer: boolean | null;
  note: string;
  status: InvoiceStatus;
  issued_at: string | null;
  created_at: string;
  // Set together with status "storniert" (issue #26). Null on an invoice
  // that has never been cancelled.
  cancelled_at: string | null;
  cancel_reason: string | null;
  // Set only on a cancellation invoice itself: the invoice it cancels.
  // Null everywhere else, including on the cancelled original.
  cancels_invoice_id: number | null;
  // The reverse link: set on the cancelled original once its cancellation
  // invoice exists. Null otherwise, including on a cancellation invoice.
  cancellation_invoice_id: number | null;
  items: InvoiceItem[];
  // The payment ledger (issue #30), replacing the old boolean paid_date.
  // amount_paid/amount_due/overpaid are computed server-side, mirroring
  // models.Invoice's Python properties of the same name -- prefer
  // utils.ts's amountPaid()/amountDue() client-side when computing from
  // an invoice you're about to mutate locally (e.g. right after posting a
  // payment), since these only refresh on the next fetch.
  payments: Payment[];
  amount_paid: string;
  amount_due: string;
  overpaid: boolean;
}

// Response of POST /api/invoices/{id}/cancel-and-correct: the new
// cancellation invoice, plus a fresh draft pre-filled from the original
// for the user to correct and re-issue.
export interface CancelAndCorrectResult {
  cancellation: Invoice;
  draft: Invoice;
}

export interface InvoiceCreateInput {
  date: string;
  client_name: string;
  client_address?: string;
  service_date?: string;
  service_period_text?: string;
  note?: string;
  items: InvoiceItemInput[];
}

// Partial update for a draft (PATCH /api/invoices/{id}) — mirrors
// backend/app/schemas.py's InvoiceUpdate. Every field is optional; only
// fields actually present are applied.
export interface InvoiceUpdateInput {
  date?: string;
  client_name?: string;
  client_address?: string;
  service_date?: string;
  service_period_text?: string;
  note?: string;
  items?: InvoiceItemInput[];
}

export interface Expense {
  id: number;
  date: string;
  category: string;
  description: string;
  amount: string;
}

export interface ExpenseCreateInput {
  date: string;
  category: string;
  description: string;
  amount: number;
}

export interface ExpenseUpdateInput {
  date?: string;
  category?: string;
  description?: string;
  amount?: number;
}

export type Lang = "de" | "en";

// The tab-based navigation state App.tsx owns — see AGENTS.md, this is
// deliberate (no router library) rather than an oversight.
export type Tab = "dashboard" | "invoices" | "invoiceNew" | "invoiceDetail" | "expenses" | "settings";
