import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InvoiceForm from "./InvoiceForm";
import type { Settings } from "../types";

// Mock react-i18next with the initReactI18next export required by i18n initialization
vi.mock("react-i18next", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const translations: Record<string, string> = {
          "invoiceForm.numberLabel": "Invoice number",
          "invoiceForm.numberPending": "assigned when issued",
          "invoiceForm.dateLabel": "Invoice date",
          "invoiceForm.clientNameLabel": "Client – name / company",
          "invoiceForm.clientNamePlaceholder": "e.g. Sample Ltd.",
          "invoiceForm.clientAddressLabel": "Client – address",
          "invoiceForm.clientAddressPlaceholder": "Street and number\nPostal code, city",
          "invoiceForm.itemsLabel": "Line items",
          "invoiceForm.itemDescPlaceholder": "Description, e.g. full-day wedding photography",
          "invoiceForm.itemQtyPlaceholder": "Qty",
          "invoiceForm.itemPricePlaceholder": "Price (net)",
          "invoiceForm.removeItemTitle": "Remove line",
          "invoiceForm.addItem": "Add line item",
          "invoiceForm.vatRateLabel": "VAT rate",
          "invoiceForm.vatOption19": "19% — commissioned work",
          "invoiceForm.vatOption7": "7% — image license / usage rights",
          "invoiceForm.vatOption0": "0% — tax-exempt",
          "invoiceForm.subtotalNet": "Subtotal (net)",
          "invoiceForm.vat": "VAT",
          "invoiceForm.total": "Total amount",
          "invoiceForm.noteLabel": "Note (optional, doesn't appear on the invoice)",
          "invoiceForm.notePlaceholder": "e.g. internal note",
          "invoiceForm.saveDraft": "Save draft",
          "invoiceForm.issue": "Issue invoice",
          "invoiceForm.validationNeedsItem": "Please enter at least one line item.",
          "invoiceForm.saveError": "Error while saving.",
          "invoiceForm.title": "New invoice",
          "invoiceForm.titleEdit": "Edit draft",
          "common.back": "Back",
        };
        return translations[key] || key;
      },
      i18n: { language: "en" },
    }),
  };
});

// Initialize i18n after mocking react-i18next
import "../i18n";

describe("InvoiceForm", () => {
  const mockSettings: Settings = {
    business_name: "Test Studio",
    owner_name: "John Doe",
    address: "123 Main St",
    tax_number: "DE123456789",
    ust_id_nr: "",
    iban: "DE89370400440532013000",
    kleinunternehmer: false,
    invoice_prefix: "FOTO",
    prev_year_revenue: "0",
  };

  it("renders the invoice number field with a pending value instead of a computed one, for a brand-new draft", () => {
    render(
      <InvoiceForm settings={mockSettings} onCancel={() => {}} onSaveDraft={async () => {}} onIssue={async () => {}} />
    );

    const numberInput = screen.getByDisplayValue("assigned when issued") as HTMLInputElement;
    expect(numberInput).toBeInTheDocument();
    expect(numberInput).toBeDisabled();
  });

  it("does not compute or display an invoice number preview", () => {
    render(
      <InvoiceForm settings={mockSettings} onCancel={() => {}} onSaveDraft={async () => {}} onIssue={async () => {}} />
    );

    // The field never shows a computed value like "FOTO2026-001" - only the
    // pending placeholder (no `invoice` prop => no real invoice.number yet).
    expect(screen.queryByDisplayValue(/FOTO/)).not.toBeInTheDocument();
  });
});
