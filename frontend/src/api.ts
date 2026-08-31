import type {
  Expense,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  Invoice,
  InvoiceCreateInput,
  InvoiceUpdateInput,
  Settings,
} from "./types";

const BASE = "/api";

// Raised for a §14 UStG issue-time validation failure (see
// backend/app/routers/invoices.py's 422 on POST /invoices/{id}/issue) —
// `missingFields` carries the precise list of missing requirements
// alongside the combined human-readable `message`, for any caller that
// wants to render them separately instead of as one string.
export class InvoiceIssueValidationError extends Error {
  missingFields: string[];

  constructor(message: string, missingFields: string[]) {
    super(message);
    this.name = "InvoiceIssueValidationError";
    this.missingFields = missingFields;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch (_) {
      /* ignore, keep statusText */
    }
    if (typeof detail === "string") {
      throw new Error(detail);
    }
    // Structured {"message": ..., "missing_fields": [...]} shape (see
    // crud.InvoiceIssueValidationError / routers/invoices.py).
    const structured = detail as { message?: string; missing_fields?: string[] };
    const missingFields = structured.missing_fields || [];
    const message = missingFields.length
      ? `${structured.message || res.statusText} ${missingFields.join(", ")}`
      : structured.message || res.statusText;
    throw new InvoiceIssueValidationError(message, missingFields);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export const api = {
  getSettings: () => request<Settings>("/settings"),
  saveSettings: (data: Settings) => request<Settings>("/settings", { method: "PUT", body: JSON.stringify(data) }),

  listInvoices: () => request<Invoice[]>("/invoices"),
  getInvoice: (id: number) => request<Invoice>(`/invoices/${id}`),
  // Creates a draft — nothing is issued/numbered yet, see InvoiceUpdateInput.
  createInvoice: (data: InvoiceCreateInput) =>
    request<Invoice>("/invoices", { method: "POST", body: JSON.stringify(data) }),
  updateInvoiceDraft: (id: number, data: InvoiceUpdateInput) =>
    request<Invoice>(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  issueInvoice: (id: number) => request<Invoice>(`/invoices/${id}/issue`, { method: "POST" }),
  markInvoicePaid: (id: number) => request<Invoice>(`/invoices/${id}/mark-paid`, { method: "POST" }),
  markInvoiceOpen: (id: number) => request<Invoice>(`/invoices/${id}/mark-open`, { method: "POST" }),
  deleteInvoice: (id: number) => request<null>(`/invoices/${id}`, { method: "DELETE" }),

  listExpenses: (year?: number | string) => request<Expense[]>(`/expenses${year ? `?year=${year}` : ""}`),
  createExpense: (data: ExpenseCreateInput) =>
    request<Expense>("/expenses", { method: "POST", body: JSON.stringify(data) }),
  updateExpense: (id: number, data: ExpenseUpdateInput) =>
    request<Expense>(`/expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteExpense: (id: number) => request<null>(`/expenses/${id}`, { method: "DELETE" }),
};
