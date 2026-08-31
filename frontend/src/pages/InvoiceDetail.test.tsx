// Smoke render for InvoiceDetail.tsx (issue #17). Presentational, driven by
// props — no `api` import here, so no `vi.mock` is needed (see the note in
// Dashboard.test.tsx).
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import InvoiceDetail from "./InvoiceDetail";
import type { Invoice, Settings } from "../types";

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
  iban: "DE00 0000 0000 0000 0000 00",
  kleinunternehmer: false,
  prev_year_revenue: "0",
  invoice_prefix: "",
};

const invoice: Invoice = {
  id: 1,
  number: "2026-001",
  date: "2026-01-15",
  client_name: "Client A",
  client_address: "Kundenstraße 2\n01002 Dresden",
  is_kleinunternehmer: false,
  vat_rate: "19",
  note: "",
  status: "offen",
  paid_date: null,
  issued_at: "2026-01-15",
  created_at: "2026-01-15T10:00:00",
  items: [{ id: 1, description: "Shoot", qty: "1", price: "500" }],
};

describe("InvoiceDetail", () => {
  it("renders the not-found state when no invoice is given", () => {
    render(
      <InvoiceDetail
        invoice={null}
        settings={settings}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onIssue={vi.fn()}
        onMarkPaid={vi.fn()}
        onMarkOpen={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(/nicht gefunden/)).toBeInTheDocument();
  });

  it("renders the invoice document with the client name and invoice number", () => {
    render(
      <InvoiceDetail
        invoice={invoice}
        settings={settings}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onIssue={vi.fn()}
        onMarkPaid={vi.fn()}
        onMarkOpen={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(/Client A/)).toBeInTheDocument();
    expect(screen.getByText("2026-001")).toBeInTheDocument();
  });
});
