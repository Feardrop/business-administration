// Smoke render for InvoiceList.tsx (issue #17). Presentational, driven by
// props — no `api` import here, so no `vi.mock` is needed (see the note in
// Dashboard.test.tsx).
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import InvoiceList from "./InvoiceList";
import type { Invoice, Settings } from "../types";

// jsdom's default navigator.language is "en-US"; force German so
// assertions here don't depend on i18next-browser-languagedetector's
// guess for this environment.
beforeAll(async () => {
  await i18n.changeLanguage("de");
});

const settings: Settings = {
  business_name: "Test Studio",
  owner_name: "",
  address: "",
  tax_number: "DE123456789",
  ust_id_nr: "",
  iban: "",
  kleinunternehmer: true,
  prev_year_revenue: "0",
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
    status: "offen",
    paid_date: null,
    issued_at: "2026-01-15",
    created_at: "2026-01-15T10:00:00",
    items: [{ id: 1, description: "Shoot", qty: "1", price: "500", vat_rate: "0" }],
  },
];

describe("InvoiceList", () => {
  it("renders the empty state when there are no invoices", () => {
    render(
      <InvoiceList
        invoices={[]}
        settings={settings}
        onNew={vi.fn()}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onMarkPaid={vi.fn()}
        onMarkOpen={vi.fn()}
      />
    );
    expect(screen.getByText(/Noch keine Rechnungen/)).toBeInTheDocument();
  });

  it("renders a row per invoice with its number and client", () => {
    render(
      <InvoiceList
        invoices={invoices}
        settings={settings}
        onNew={vi.fn()}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onMarkPaid={vi.fn()}
        onMarkOpen={vi.fn()}
      />
    );
    expect(screen.getByText("2026-001")).toBeInTheDocument();
    expect(screen.getByText("Client A")).toBeInTheDocument();
  });
});
