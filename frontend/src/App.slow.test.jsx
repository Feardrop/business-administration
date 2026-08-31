// Placeholder for the slow-test lane ci.yaml's `test:slow` script runs.
// This mounts the full App tree with a mocked API — not actually slow yet,
// but establishes the *.slow.test.jsx convention for the genuinely slow
// integration tests issue #17 will add.
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./api";
import "./i18n";

vi.mock("./api", () => ({
  api: {
    getSettings: vi.fn(),
    listInvoices: vi.fn(),
    listExpenses: vi.fn(),
  },
}));

describe("App", () => {
  it("renders the dashboard once settings and data have loaded", async () => {
    api.getSettings.mockResolvedValue({ business_name: "Test Studio", tax_number: "DE123456789" });
    api.listInvoices.mockResolvedValue([]);
    api.listExpenses.mockResolvedValue([]);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Test Studio")).toBeInTheDocument());
  });
});
