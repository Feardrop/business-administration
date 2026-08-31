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

export type InvoiceStatus = "offen" | "bezahlt";

export interface Invoice {
  id: number;
  number: string;
  date: string;
  client_name: string;
  client_address: string;
  is_kleinunternehmer: boolean;
  vat_rate: string;
  note: string;
  status: InvoiceStatus;
  paid_date: string | null;
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
