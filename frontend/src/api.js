const BASE = "/api";

async function request(path, options = {}) {
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
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getSettings: () => request("/settings"),
  saveSettings: (data) => request("/settings", { method: "PUT", body: JSON.stringify(data) }),

  listInvoices: () => request("/invoices"),
  getInvoice: (id) => request(`/invoices/${id}`),
  createInvoice: (data) => request("/invoices", { method: "POST", body: JSON.stringify(data) }),
  markInvoicePaid: (id) => request(`/invoices/${id}/mark-paid`, { method: "POST" }),
  markInvoiceOpen: (id) => request(`/invoices/${id}/mark-open`, { method: "POST" }),
  deleteInvoice: (id) => request(`/invoices/${id}`, { method: "DELETE" }),

  listExpenses: (year) => request(`/expenses${year ? `?year=${year}` : ""}`),
  createExpense: (data) => request("/expenses", { method: "POST", body: JSON.stringify(data) }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: "DELETE" }),
};
