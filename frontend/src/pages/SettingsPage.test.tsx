// Smoke render for SettingsPage.tsx (issue #17). Presentational, driven by
// props — no `api` import here, so no `vi.mock` is needed (see the note in
// Dashboard.test.tsx).
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import SettingsPage from "./SettingsPage";
import type { Settings } from "../types";

// jsdom's default navigator.language is "en-US"; force German so
// assertions here don't depend on i18next-browser-languagedetector's
// guess for this environment.
beforeAll(async () => {
  await i18n.changeLanguage("de");
});

const settings: Settings = {
  business_name: "Test Studio",
  owner_name: "Jane Doe",
  address: "",
  tax_number: "DE123456789",
  ust_id_nr: "",
  iban: "",
  kleinunternehmer: true,
  prev_year_revenue: "0",
  invoice_prefix: "",
};

describe("SettingsPage", () => {
  it("renders the form pre-filled with the given settings", () => {
    render(<SettingsPage settings={settings} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("Test Studio")).toBeInTheDocument();
    expect(screen.getByDisplayValue("DE123456789")).toBeInTheDocument();
  });
});
