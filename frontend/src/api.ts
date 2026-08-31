import type { Expense, ExpenseCreateInput, Invoice, InvoiceCreateInput, Settings } from "./types";

const BASE = "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch (_) {
      /* ignore, keep statusText */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export const api = {
  getSettings: () => request<Settings>("/settings"),
  saveSettings: (data: Settings) => request<Settings>("/settings", { method: "PUT", body: JSON.stringify(data) }),

  listInvoices: () => request<Invoice[]>("/invoices"),
  getInvoice: (id: number) => request<Invoice>(`/invoices/${id}`),
  createInvoice: (data: InvoiceCreateInput) =>
    request<Invoice>("/invoices", { method: "POST", body: JSON.stringify(data) }),
  markInvoicePaid: (id: number) => request<Invoice>(`/invoices/${id}/mark-paid`, { method: "POST" }),
  markInvoiceOpen: (id: number) => request<Invoice>(`/invoices/${id}/mark-open`, { method: "POST" }),
  deleteInvoice: (id: number) => request<null>(`/invoices/${id}`, { method: "DELETE" }),

  listExpenses: (year?: number | string) => request<Expense[]>(`/expenses${year ? `?year=${year}` : ""}`),
  createExpense: (data: ExpenseCreateInput) =>
    request<Expense>("/expenses", { method: "POST", body: JSON.stringify(data) }),
  deleteExpense: (id: number) => request<null>(`/expenses/${id}`, { method: "DELETE" }),
};
