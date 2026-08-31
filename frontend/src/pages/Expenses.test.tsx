// Smoke render for Expenses.tsx (issue #17). Presentational, driven by
// props — no `api` import here, so no `vi.mock` is needed (see the note in
// Dashboard.test.tsx).
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import Expenses from "./Expenses";
import type { Expense } from "../types";

// jsdom's default navigator.language is "en-US"; force German so
// assertions here don't depend on i18next-browser-languagedetector's
// guess for this environment.
beforeAll(async () => {
  await i18n.changeLanguage("de");
});

const expenses: Expense[] = [{ id: 1, date: "2026-01-05", category: "equipment", description: "Lens", amount: "300" }];

describe("Expenses", () => {
  it("renders the empty state when there are no expenses", () => {
    render(<Expenses expenses={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/Noch keine Ausgaben erfasst/)).toBeInTheDocument();
  });

  it("renders a row per expense with its translated category label", () => {
    render(<Expenses expenses={expenses} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Lens")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ausrüstung" })).toBeInTheDocument();
  });
});
