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
}

export interface InvoiceItemInput {
  description: string;
  qty: number | string;
  price: number | string;
}

// Full target status lifecycle (see backend/app/schemas.py's InvoiceStatus
// comment / backend/app/models.py's Invoice docstring for the diagram):
//   draft --issue--> offen --pay--> bezahlt
//     |                 |
//     +--delete         +--cancel--> storniert          (future issue #26)
//     offen --partial payment--> teilweise bezahlt --(pay rest)--> bezahlt
//                                                                  (#30)
//     teilweise bezahlt --cancel--> storniert                     (#26)
// Only "draft" | "offen" | "bezahlt" are actually produced by this app
// today — "teilweise bezahlt" and "storniert" are listed so the type
// doesn't need another breaking change once #26/#30 land.
export type InvoiceStatus = "draft" | "offen" | "teilweise bezahlt" | "bezahlt" | "storniert";

export interface Invoice {
  id: number;
  // Null while status is "draft" — assigned once, at issue time, and
  // never changed again.
  number: string | null;
  date: string;
  client_name: string;
  client_address: string;
  // Null while status is "draft" — snapshotted from settings at issue
  // time and immutable afterward.
  is_kleinunternehmer: boolean | null;
  vat_rate: string;
  note: string;
  status: InvoiceStatus;
  paid_date: string | null;
  issued_at: string | null;
  created_at: string;
  items: InvoiceItem[];
}

export interface InvoiceCreateInput {
  date: string;
  client_name: string;
  client_address?: string;
  vat_rate?: number;
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
  vat_rate?: number;
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
