// Minimal smoke tests establishing the fast-test convention ci.yaml relies
// on. Not comprehensive - that's the scope of issue #17 ("Establish a test
// suite"). Fast tests live in `*.test.ts(x)`; slow ones in `*.slow.test.tsx`
// (see package.json's `test`/`test:slow` scripts).
import { describe, expect, it } from "vitest";
import {
  amountDue,
  amountPaid,
  computeInvoiceStats,
  fmtDate,
  fmtEUR,
  invoiceTotals,
  isOverpaid,
  isoYear,
} from "./utils";

describe("invoiceTotals", () => {
  // Issue #33: vat_rate moved from the invoice onto each line item, and
  // invoiceTotals now groups subtotals per distinct rate present.

  it("computes net/vat/gross for a single-rate VAT-registered invoice (unchanged from before)", () => {
    const totals = invoiceTotals({
      is_kleinunternehmer: false,
      items: [{ qty: 2, price: 100, vat_rate: 19 }],
    });
    expect(totals.net).toBe(200);
    expect(totals.vat).toBeCloseTo(38);
    expect(totals.gross).toBeCloseTo(238);
    expect(totals.breakdown).toEqual([{ vat_rate: 19, net: 200, vat: 38 }]);
  });

  it("groups subtotals per rate for a mixed 19%/7% invoice", () => {
    const totals = invoiceTotals({
      is_kleinunternehmer: false,
      items: [
        { qty: 1, price: 100, vat_rate: 19 },
        { qty: 1, price: 50, vat_rate: 7 },
      ],
    });
    expect(totals.net).toBe(150);
    expect(totals.breakdown).toHaveLength(2);
    const byRate = Object.fromEntries(totals.breakdown.map((b) => [b.vat_rate, b]));
    expect(byRate[19]).toEqual({ vat_rate: 19, net: 100, vat: 19 });
    expect(byRate[7]).toEqual({ vat_rate: 7, net: 50, vat: 3.5 });
    expect(totals.vat).toBeCloseTo(22.5);
    expect(totals.gross).toBeCloseTo(172.5);
  });

  it("sums two lines sharing the same rate into a single breakdown entry", () => {
    const totals = invoiceTotals({
      is_kleinunternehmer: false,
      items: [
        { qty: 1, price: 100, vat_rate: 19 },
        { qty: 1, price: 20, vat_rate: 19 },
      ],
    });
    expect(totals.breakdown).toEqual([{ vat_rate: 19, net: 120, vat: 22.8 }]);
  });

  it("charges no VAT and has no breakdown for a Kleinunternehmer invoice, regardless of per-line rates", () => {
    const totals = invoiceTotals({
      is_kleinunternehmer: true,
      items: [
        { qty: 1, price: 50, vat_rate: 19 },
        { qty: 1, price: 30, vat_rate: 7 },
      ],
    });
    expect(totals.vat).toBe(0);
    expect(totals.gross).toBe(80);
    expect(totals.breakdown).toEqual([]);
  });

  it("treats a missing items array as zero total", () => {
    const totals = invoiceTotals({ is_kleinunternehmer: false });
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

describe("amountPaid / amountDue / isOverpaid", () => {
  // Issue #30: these operate on inv.payments (the real ledger), not the
  // old boolean paid_date -- invoiceTotals stays net/vat/gross only.

  it("sums every recorded payment regardless of date", () => {
    const inv = {
      payments: [
        { date: "2026-01-05", amount: "40.00" },
        { date: "2026-02-10", amount: "25.50" },
      ],
    };
    expect(amountPaid(inv)).toBeCloseTo(65.5);
  });

  it("amountDue is gross minus payments-to-date for a partially-paid invoice", () => {
    const inv = {
      is_kleinunternehmer: true,
      items: [{ qty: 1, price: 100, vat_rate: 0 }],
      payments: [{ date: "2026-01-05", amount: "40.00" }],
    };
    expect(amountDue(inv)).toBeCloseTo(60);
    expect(isOverpaid(inv)).toBe(false);
  });

  it("amountDue floors at 0 and isOverpaid flags an overpayment instead of going negative", () => {
    const inv = {
      is_kleinunternehmer: true,
      items: [{ qty: 1, price: 100, vat_rate: 0 }],
      payments: [{ date: "2026-01-05", amount: "150.00" }],
    };
    expect(amountDue(inv)).toBe(0);
    expect(isOverpaid(inv)).toBe(true);
  });

  it("an invoice with no payments yet is fully due", () => {
    const inv = { is_kleinunternehmer: true, items: [{ qty: 1, price: 100, vat_rate: 0 }], payments: [] };
    expect(amountPaid(inv)).toBe(0);
    expect(amountDue(inv)).toBe(100);
    expect(isOverpaid(inv)).toBe(false);
  });
});

describe("computeInvoiceStats", () => {
  // Issue #26: a "storniert" (cancelled) invoice must never contribute to
  // revenue, VAT, or open-balance figures on the Dashboard -- deleting an
  // issued invoice isn't allowed under §14c UStG, so cancellation is the
  // only way an issued invoice's amount stops counting, and the dashboard
  // must actually honor that everywhere it aggregates by status.
  //
  // Issue #30: income/VAT are now attributed by each *payment's own*
  // date, not by the invoice's (removed) paid_date -- the Zufluss-Prinzip
  // fix for cash-basis tax-year attribution. "open" sums the remaining
  // balance due, not the full gross, for a partially-paid invoice.

  it("counts a fully-paid invoice's net/vat/gross normally", () => {
    const stats = computeInvoiceStats(
      [
        {
          status: "bezahlt",
          is_kleinunternehmer: false,
          items: [{ qty: 1, price: 100, vat_rate: 19 }],
          payments: [{ date: "2026-03-01", amount: "119.00" }],
        },
      ],
      2026
    );
    expect(stats.income).toBeCloseTo(100);
    expect(stats.vatCollected).toBeCloseTo(19);
    expect(stats.revenueThisYearGross).toBeCloseTo(119);
    expect(stats.paidThisYearCount).toBe(1);
  });

  it("excludes a cancelled invoice from income/VAT/revenue even though it has payments this year", () => {
    const stats = computeInvoiceStats(
      [
        {
          status: "storniert",
          is_kleinunternehmer: false,
          items: [{ qty: 1, price: 100, vat_rate: 19 }],
          payments: [{ date: "2026-03-01", amount: "119.00" }],
        },
      ],
      2026
    );
    expect(stats.income).toBe(0);
    expect(stats.vatCollected).toBe(0);
    expect(stats.revenueThisYearGross).toBe(0);
    expect(stats.paidThisYearCount).toBe(0);
  });

  it("excludes a cancelled invoice from the open balance", () => {
    const stats = computeInvoiceStats(
      [
        {
          status: "storniert",
          is_kleinunternehmer: false,
          items: [{ qty: 1, price: 100, vat_rate: 19 }],
          payments: [],
        },
      ],
      2026
    );
    expect(stats.openSum).toBe(0);
    expect(stats.openInvoicesCount).toBe(0);
  });

  it("still counts an unrelated open invoice alongside an excluded cancelled one", () => {
    const stats = computeInvoiceStats(
      [
        {
          status: "storniert",
          is_kleinunternehmer: false,
          items: [{ qty: 1, price: 999, vat_rate: 19 }],
          payments: [],
        },
        {
          status: "offen",
          is_kleinunternehmer: false,
          items: [{ qty: 1, price: 50, vat_rate: 19 }],
          payments: [],
        },
      ],
      2026
    );
    expect(stats.openInvoicesCount).toBe(1);
    expect(stats.openSum).toBeCloseTo(59.5);
  });

  it("attributes income to the year a payment was actually received, not the invoice's own date", () => {
    // Issue #30, TDD step 6: a payment dated Dec 31 of year Y and one
    // dated Jan 2 of year Y+1, on two different invoices -- each must be
    // attributed to its own payment year, not lumped together.
    const invoiceA = {
      status: "bezahlt",
      is_kleinunternehmer: true,
      items: [{ qty: 1, price: 100, vat_rate: 0 }],
      payments: [{ date: "2026-12-31", amount: "100.00" }],
    };
    const invoiceB = {
      status: "bezahlt",
      is_kleinunternehmer: true,
      items: [{ qty: 1, price: 200, vat_rate: 0 }],
      payments: [{ date: "2027-01-02", amount: "200.00" }],
    };

    const stats2026 = computeInvoiceStats([invoiceA, invoiceB], 2026);
    expect(stats2026.income).toBeCloseTo(100);
    expect(stats2026.revenueThisYearGross).toBeCloseTo(100);
    expect(stats2026.paidThisYearCount).toBe(1);

    const stats2027 = computeInvoiceStats([invoiceA, invoiceB], 2027);
    expect(stats2027.income).toBeCloseTo(200);
    expect(stats2027.revenueThisYearGross).toBeCloseTo(200);
    expect(stats2027.paidThisYearCount).toBe(1);
  });

  it("attributes a payment entered late but dated in a prior year to that prior year (the actual bug fix)", () => {
    // A payment physically received in December but only entered into the
    // app in March must still count as December's income -- this is
    // exactly what the old paid_date-always-today() bug broke.
    const invoice = {
      status: "bezahlt",
      is_kleinunternehmer: true,
      items: [{ qty: 1, price: 100, vat_rate: 0 }],
      payments: [{ date: "2025-12-20", amount: "100.00" }],
    };

    expect(computeInvoiceStats([invoice], 2025).income).toBeCloseTo(100);
    expect(computeInvoiceStats([invoice], 2026).income).toBe(0);
  });

  it("open sum uses the remaining balance due for a partially-paid invoice, not its full gross", () => {
    // Issue #30, TDD step 9.
    const stats = computeInvoiceStats(
      [
        {
          status: "teilweise bezahlt",
          is_kleinunternehmer: true,
          items: [{ qty: 1, price: 100, vat_rate: 0 }],
          payments: [{ date: "2026-01-10", amount: "40.00" }],
        },
        {
          status: "offen",
          is_kleinunternehmer: true,
          items: [{ qty: 1, price: 50, vat_rate: 0 }],
          payments: [],
        },
      ],
      2026
    );
    // 60 remaining on the partial invoice + 50 fully due, not 100 + 50.
    expect(stats.openSum).toBeCloseTo(110);
    expect(stats.openInvoicesCount).toBe(2);
  });

  it("splits a partial payment's income/VAT proportionally rather than counting the whole invoice", () => {
    const stats = computeInvoiceStats(
      [
        {
          status: "teilweise bezahlt",
          is_kleinunternehmer: false,
          items: [{ qty: 1, price: 100, vat_rate: 19 }],
          payments: [{ date: "2026-01-10", amount: "59.50" }], // half of 119 gross
        },
      ],
      2026
    );
    expect(stats.income).toBeCloseTo(50);
    expect(stats.vatCollected).toBeCloseTo(9.5);
    expect(stats.revenueThisYearGross).toBeCloseTo(59.5);
  });
});

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
