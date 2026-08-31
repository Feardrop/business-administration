// Smoke render for Dashboard.tsx (issue #17). Dashboard is a presentational
// component driven entirely by props from App.tsx — it never imports `api`
// itself — so there is nothing to `vi.mock` here (unlike App.slow.test.tsx,
// which mounts the full tree including the data-fetching effect).
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import Dashboard from "./Dashboard";
import type { Expense, Invoice, Settings } from "../types";

// jsdom's default navigator.language is "en-US"; force German so
// assertions here don't depend on i18next-browser-languagedetector's
// guess for this environment.
beforeAll(async () => {
  await i18n.changeLanguage("de");
});

const settings: Settings = {
  business_name: "Test Studio",
  owner_name: "Jane Doe",
  address: "Teststraße 1\n01001 Dresden",
  tax_number: "DE123456789",
  ust_id_nr: "",
  iban: "",
  kleinunternehmer: true,
  prev_year_revenue: "5000",
  invoice_prefix: "",
};

const invoices: Invoice[] = [
  {
    id: 1,
    number: "2026-001",
    date: "2026-01-15",
    client_name: "Client A",
    client_address: "",
    service_date: "2026-01-15",
    service_period_text: null,
    is_kleinunternehmer: true,
    note: "",
    status: "bezahlt",
    issued_at: "2026-01-15",
    created_at: "2026-01-15T10:00:00",
    cancelled_at: null,
    cancel_reason: null,
    cancels_invoice_id: null,
    cancellation_invoice_id: null,
    payments: [{ id: 1, invoice_id: 1, date: "2026-01-20", amount: "500", method: "", note: null }],
    amount_paid: "500",
    amount_due: "0",
    overpaid: false,
    items: [{ id: 1, description: "Shoot", qty: "1", price: "500", vat_rate: "0" }],
  },
];

const expenses: Expense[] = [{ id: 1, date: "2026-01-05", category: "equipment", description: "Lens", amount: "300" }];

describe("Dashboard", () => {
  it("renders without crashing and shows the business name context", () => {
    render(<Dashboard settings={settings} invoices={invoices} expenses={expenses} onTab={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Übersicht 2026/ })).toBeInTheDocument();
  });

  it("shows a missing-required-fields banner when business info is incomplete", () => {
    render(
      <Dashboard
        settings={{ ...settings, business_name: "", tax_number: "" }}
        invoices={[]}
        expenses={[]}
        onTab={vi.fn()}
      />
    );
    expect(screen.getByText("Einstellungen", { selector: "strong" })).toBeInTheDocument();
  });
});
