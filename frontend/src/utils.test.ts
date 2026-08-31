// Minimal smoke tests establishing the fast-test convention ci.yaml relies
// on. Not comprehensive - that's the scope of issue #17 ("Establish a test
// suite"). Fast tests live in `*.test.ts(x)`; slow ones in `*.slow.test.tsx`
// (see package.json's `test`/`test:slow` scripts).
import { describe, expect, it } from "vitest";
import { fmtDate, fmtEUR, invoiceTotals, isoYear } from "./utils";

describe("invoiceTotals", () => {
  it("computes net/vat/gross for a 19% VAT-registered invoice", () => {
    const totals = invoiceTotals({
      is_kleinunternehmer: false,
      vat_rate: 19,
      items: [{ qty: 2, price: 100 }],
    });
    expect(totals.net).toBe(200);
    expect(totals.vat).toBeCloseTo(38);
    expect(totals.gross).toBeCloseTo(238);
  });

  it("computes net/vat/gross for a 7% VAT-registered invoice", () => {
    const totals = invoiceTotals({
      is_kleinunternehmer: false,
      vat_rate: 7,
      items: [{ qty: 3, price: 100 }],
    });
    expect(totals.net).toBe(300);
    expect(totals.vat).toBeCloseTo(21);
    expect(totals.gross).toBeCloseTo(321);
  });

  it("charges no VAT for a VAT-registered invoice using the 0% rate", () => {
    const totals = invoiceTotals({
      is_kleinunternehmer: false,
      vat_rate: 0,
      items: [{ qty: 4, price: 25 }],
    });
    expect(totals.net).toBe(100);
    expect(totals.vat).toBe(0);
    expect(totals.gross).toBe(100);
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

  it("ignores vat_rate entirely for a Kleinunternehmer invoice, regardless of its value", () => {
    for (const vat_rate of [7, 0]) {
      const totals = invoiceTotals({ is_kleinunternehmer: true, vat_rate, items: [{ qty: 1, price: 50 }] });
      expect(totals.vat).toBe(0);
      expect(totals.gross).toBe(50);
    }
  });

  it("sums multiple line items before applying VAT", () => {
    const totals = invoiceTotals({
      is_kleinunternehmer: false,
      vat_rate: 19,
      items: [
        { qty: 1, price: 100 },
        { qty: 2, price: 50 },
      ],
    });
    expect(totals.net).toBe(200);
    expect(totals.vat).toBeCloseTo(38);
  });

  it("treats a missing items array as zero total", () => {
    const totals = invoiceTotals({ is_kleinunternehmer: false, vat_rate: 19 });
    expect(totals.net).toBe(0);
    expect(totals.vat).toBe(0);
    expect(totals.gross).toBe(0);
  });
});

// Intl.NumberFormat inserts a non-ASCII space next to the currency symbol
// (narrow no-break space U+202F, or non-breaking space U+00A0, depending on
// the ICU build) instead of a plain space. Normalize before comparing so
// the assertion doesn't depend on which one the current environment picks.
const NON_ASCII_SPACES = new RegExp("[  ]", "g");
const normalizeSpaces = (s: string): string => s.replace(NON_ASCII_SPACES, " ");

describe("fmtEUR", () => {
  it("formats with German locale conventions by default", () => {
    expect(normalizeSpaces(fmtEUR(1234.5))).toBe("1.234,50 €");
  });

  it("formats with English locale conventions when requested", () => {
    expect(normalizeSpaces(fmtEUR(1234.5, "en"))).toBe("€1,234.50");
  });

  it("treats null/undefined/non-numeric input as zero", () => {
    expect(normalizeSpaces(fmtEUR(null))).toBe("0,00 €");
    expect(normalizeSpaces(fmtEUR(undefined))).toBe("0,00 €");
    expect(normalizeSpaces(fmtEUR("not-a-number"))).toBe("0,00 €");
  });

  it("accepts numeric strings, matching how Decimal fields arrive from the API", () => {
    expect(normalizeSpaces(fmtEUR("19.99"))).toBe("19,99 €");
  });
});

describe("fmtDate", () => {
  it("formats as DD.MM.YYYY for German", () => {
    expect(fmtDate("2026-01-05", "de")).toBe("05.01.2026");
  });

  it("formats as MM/DD/YYYY for English", () => {
    expect(fmtDate("2026-01-05", "en")).toBe("01/05/2026");
  });

  it("defaults to German when no lang is given", () => {
    expect(fmtDate("2026-12-31")).toBe("31.12.2026");
  });

  it("returns an em dash for null/undefined input", () => {
    expect(fmtDate(null)).toBe("–");
    expect(fmtDate(undefined)).toBe("–");
  });

  it("returns the raw string for an unparseable date", () => {
    expect(fmtDate("not-a-date")).toBe("not-a-date");
  });
});

describe("isoYear", () => {
  it("extracts the year from an ISO date string", () => {
    expect(isoYear("2026-01-01")).toBe(2026);
    expect(isoYear("2025-12-31")).toBe(2025);
    expect(isoYear("2000-06-15")).toBe(2000);
  });

  it("handles null and undefined by returning NaN", () => {
    expect(isNaN(isoYear(null))).toBe(true);
    expect(isNaN(isoYear(undefined))).toBe(true);
  });

  it("uses string slicing instead of Date parsing to avoid timezone issues", () => {
    const originalTZ = process.env.TZ;
    try {
      // Set TZ to America/New_York (UTC-5, a negative offset)
      process.env.TZ = "America/New_York";

      // Demonstrate the bug: new Date("2026-01-01").getFullYear() returns 2025 in this TZ.
      // In UTC, "2026-01-01" is 00:00:00 UTC.
      // In EST (UTC-5), that's 2025-12-31 19:00:00.
      const buggedYear = new Date("2026-01-01").getFullYear();
      expect(buggedYear).toBe(2025);

      // But isoYear should return 2026 because it uses string slicing, not Date parsing.
      const correctYear = isoYear("2026-01-01");
      expect(correctYear).toBe(2026);
    } finally {
      process.env.TZ = originalTZ;
    }
  });

  it("agrees with fmtDate on the year even in negative-offset timezones", () => {
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";

      // fmtDate uses new Date(iso + "T00:00:00"), which parses in local time,
      // so it correctly displays "01.01.2026" for the ISO string "2026-01-01".
      const formatted = fmtDate("2026-01-01", "de");
      expect(formatted).toContain("01.01.2026");

      // isoYear should also return 2026, matching the displayed date.
      const extractedYear = isoYear("2026-01-01");
      expect(extractedYear).toBe(2026);
    } finally {
      process.env.TZ = originalTZ;
    }
  });
});
