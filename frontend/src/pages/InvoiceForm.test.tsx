// Smoke render for InvoiceForm.tsx (issue #17). Presentational, driven by
// props — no `api` import here, so no `vi.mock` is needed (see the note in
// Dashboard.test.tsx).
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import InvoiceForm from "./InvoiceForm";
import type { Settings } from "../types";

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
  iban: "",
  kleinunternehmer: false,
  prev_year_revenue: "0",
  invoice_prefix: "",
};

describe("InvoiceForm", () => {
  it("shows a VAT-rate selector when not a Kleinunternehmer", () => {
    render(<InvoiceForm settings={settings} onCancel={vi.fn()} onSaveDraft={vi.fn()} onIssue={vi.fn()} />);
    expect(screen.getByText(/19 %/)).toBeInTheDocument();
  });

  it("hides the VAT-rate selector for a Kleinunternehmer", () => {
    render(
      <InvoiceForm
        settings={{ ...settings, kleinunternehmer: true }}
        onCancel={vi.fn()}
        onSaveDraft={vi.fn()}
        onIssue={vi.fn()}
      />
    );
    expect(screen.queryByText(/19 %/)).not.toBeInTheDocument();
  });
});
