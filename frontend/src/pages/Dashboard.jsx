import { currentYear, fmtEUR, invoiceTotals } from "../utils";

export default function Dashboard({ settings, invoices, expenses, onTab }) {
  const y = currentYear();
  const paidThisYear = invoices.filter((i) => i.status === "bezahlt" && i.paid_date && new Date(i.paid_date).getFullYear() === y);
  const openInvoices = invoices.filter((i) => i.status === "offen");
  const expensesThisYear = expenses.filter((e) => new Date(e.date).getFullYear() === y);

  const income = paidThisYear.reduce((s, i) => s + invoiceTotals(i).net, 0);
  const vatCollected = paidThisYear.reduce((s, i) => s + invoiceTotals(i).vat, 0);
  const expenseSum = expensesThisYear.reduce((s, e) => s + Number(e.amount || 0), 0);
  const profit = income - expenseSum;
  const openSum = openInvoices.reduce((s, i) => s + invoiceTotals(i).gross, 0);
  const revenueThisYearGross = paidThisYear.reduce((s, i) => s + invoiceTotals(i).gross, 0);
  const prevYearRevenue = Number(settings.prev_year_revenue) || 0;

  const prevPct = Math.min(100, (prevYearRevenue / 25000) * 100);
  const curPct = Math.min(100, (revenueThisYearGross / 100000) * 100);
  const prevState = prevYearRevenue > 25000 ? "over" : prevYearRevenue > 20000 ? "warn" : "";
  const curState = revenueThisYearGross > 100000 ? "over" : revenueThisYearGross > 85000 ? "warn" : "";

  const missingRequired = !settings.business_name || !settings.tax_number;

  return (
    <>
      {missingRequired && (
        <div className="banner banner-amber">
          ⚠ In den{" "}
          <strong style={{ margin: "0 3px", cursor: "pointer", textDecoration: "underline" }} onClick={() => onTab("settings")}>
            Einstellungen
          </strong>{" "}
          fehlen noch Pflichtangaben für rechtsgültige Rechnungen (Name/Anschrift, Steuernummer).
        </div>
      )}
      <div className="page-head">
        <div>
          <h2>Übersicht {y}</h2>
          <p>Zahlen auf Zufluss-Basis – bezahlte Rechnungen und erfasste Ausgaben.</p>
        </div>
      </div>
      <div className="grid-3">
        <div className="card">
          <div className="stat-label">Einnahmen (netto)</div>
          <div className="stat-value">{fmtEUR(income)}</div>
          {vatCollected > 0 ? (
            <div className="stat-sub">zzgl. {fmtEUR(vatCollected)} USt, ans Finanzamt abzuführen</div>
          ) : (
            <div className="stat-sub">{paidThisYear.length} bezahlte Rechnung(en)</div>
          )}
        </div>
        <div className="card">
          <div className="stat-label">Ausgaben</div>
          <div className="stat-value">{fmtEUR(expenseSum)}</div>
          <div className="stat-sub">{expensesThisYear.length} Position(en)</div>
        </div>
        <div className="card">
          <div className="stat-label">Gewinn (EÜR-Vorschau)</div>
          <div className="stat-value">{fmtEUR(profit)}</div>
          <div className="stat-sub">Grundfreibetrag ggf. beachten</div>
        </div>
      </div>

      {openInvoices.length > 0 && (
        <div className="card">
          <div className="stat-label">Offene Rechnungen</div>
          <div className="stat-value">{fmtEUR(openSum)}</div>
          <div className="stat-sub">
            {openInvoices.length} noch nicht als bezahlt markiert –{" "}
            <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => onTab("invoices")}>ansehen</span>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="stat-label" style={{ marginBottom: 12 }}>Kleinunternehmer-Grenzen (§19 UStG)</div>
        <div className="gauge">
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 3 }}>
            Vorjahresumsatz (manuell in Einstellungen) — Grenze 25.000 €
          </div>
          <div className="gauge-track"><div className={`gauge-fill ${prevState}`} style={{ width: `${prevPct}%` }} /></div>
          <div className="gauge-ticks"><span>0 €</span><span>{fmtEUR(prevYearRevenue)}</span><span>25.000 €</span></div>
        </div>
        <div className="gauge" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 3 }}>
            Laufendes Jahr (bezahlte Rechnungen) — Grenze 100.000 €
          </div>
          <div className="gauge-track"><div className={`gauge-fill ${curState}`} style={{ width: `${curPct}%` }} /></div>
          <div className="gauge-ticks"><span>0 €</span><span>{fmtEUR(revenueThisYearGross)}</span><span>100.000 €</span></div>
        </div>
        <div className="gauge-caption">
          Überschreitest du eine der Grenzen, entfällt die Kleinunternehmerregelung – die laufende Grenze sogar sofort, nicht erst im Folgejahr.
        </div>
      </div>
      <p style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 18 }}>
        Diese Übersicht ist eine private Vorschau und ersetzt keine Steuerberatung.
      </p>
    </>
  );
}
