// Minimal smoke tests establishing the fast-test convention ci.yaml relies
// on. Not comprehensive - that's the scope of issue #17 ("Establish a test
// suite"). Fast tests live in `*.test.ts(x)`; slow ones in `*.slow.test.tsx`
// (see package.json's `test`/`test:slow` scripts).
import { describe, expect, it } from "vitest";
import { fmtEUR, invoiceTotals } from "./utils";

describe("invoiceTotals", () => {
  it("computes net/vat/gross for a VAT-registered invoice", () => {
    const totals = invoiceTotals({
      is_kleinunternehmer: false,
      vat_rate: 19,
      items: [{ qty: 2, price: 100 }],
    });
    expect(totals.net).toBe(200);
    expect(totals.vat).toBeCloseTo(38);
    expect(totals.gross).toBeCloseTo(238);
  });

  it("charges no VAT for a Kleinunternehmer invoice", () => {
    const totals = invoiceTotals({
      is_kleinunternehmer: true,
      vat_rate: 19,
      items: [{ qty: 1, price: 50 }],
    });
    expect(totals.vat).toBe(0);
    expect(totals.gross).toBe(50);
  });
});

// Intl.NumberFormat inserts a non-ASCII space next to the currency symbol
// (narrow no-break space U+202F, or non-breaking space U+00A0, depending on
// the ICU build) instead of a plain space. Normalize before comparing so
// the assertion doesn't depend on which one the current environment picks.
const NON_ASCII_SPACES = new RegExp("[\u00A0\u202F]", "g");
const normalizeSpaces = (s: string): string => s.replace(NON_ASCII_SPACES, " ");

describe("fmtEUR", () => {
  it("formats with German locale conventions by default", () => {
    expect(normalizeSpaces(fmtEUR(1234.5))).toBe("1.234,50 €");
  });

  it("formats with English locale conventions when requested", () => {
    expect(normalizeSpaces(fmtEUR(1234.5, "en"))).toBe("€1,234.50");
  });
});
