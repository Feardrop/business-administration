import { useTranslation } from "react-i18next";
import { computeInvoiceStats, currentYear, fmtEUR, isoYear } from "../utils";
import type { Expense, Invoice, Settings, Tab } from "../types";

interface DashboardProps {
  settings: Settings;
  invoices: Invoice[];
  expenses: Expense[];
  onTab: (tab: Tab) => void;
}

export default function Dashboard({ settings, invoices, expenses, onTab }: DashboardProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "de";
  const y = currentYear();
  // Every revenue/VAT/open-balance/threshold figure below goes through
  // this one function, which excludes "storniert" (cancelled) invoices up
  // front (issue #26) — see utils.ts's computeInvoiceStats. Issue #30:
  // income/VAT/revenue are now attributed by each payment's own year
  // (Zufluss-Prinzip), not by invoice status/date, and "open" is the
  // remaining balance due for a "teilweise bezahlt" invoice, not its full
  // gross.
  const stats = computeInvoiceStats(invoices, y);
  const expensesThisYear = expenses.filter((e) => isoYear(e.date) === y);

  const expenseSum = expensesThisYear.reduce((s, e) => s + Number(e.amount || 0), 0);
  const profit = stats.income - expenseSum;
  const revenueThisYearGross = stats.revenueThisYearGross;
  const prevYearRevenue = Number(settings.prev_year_revenue) || 0;

  const prevPct = Math.min(100, (prevYearRevenue / 25000) * 100);
  const curPct = Math.min(100, (revenueThisYearGross / 100000) * 100);
  const prevState = prevYearRevenue > 25000 ? "over" : prevYearRevenue > 20000 ? "warn" : "";
  const curState = revenueThisYearGross > 100000 ? "over" : revenueThisYearGross > 85000 ? "warn" : "";

  // Kept consistent with backend/app/crud.py's `_missing_issue_fields`
  // (issue #33): business_name + address are always required, and either
  // tax_number or ust_id_nr satisfies the Steuernummer-or-USt-IdNr
  // requirement.
  const missingRequired = !settings.business_name || !settings.address || (!settings.tax_number && !settings.ust_id_nr);

  return (
    <>
      {missingRequired && (
        <div className="banner banner-amber">
          {t("dashboard.missingRequiredBefore")}
          <strong
            style={{ margin: "0 3px", cursor: "pointer", textDecoration: "underline" }}
            onClick={() => onTab("settings")}
          >
            {t("dashboard.missingRequiredLink")}
          </strong>
          {t("dashboard.missingRequiredAfter")}
        </div>
      )}
      <div className="page-head">
        <div>
          <h2>{t("dashboard.title", { year: y })}</h2>
          <p>{t("dashboard.subtitle")}</p>
        </div>
      </div>
      <div className="grid-3">
        <div className="card">
          <div className="stat-label">{t("dashboard.incomeNet")}</div>
          <div className="stat-value">{fmtEUR(stats.income, lang)}</div>
          {stats.vatCollected > 0 ? (
            <div className="stat-sub">{t("dashboard.vatNote", { amount: fmtEUR(stats.vatCollected, lang) })}</div>
          ) : (
            <div className="stat-sub">{t("dashboard.paidInvoicesCount", { count: stats.paidThisYearCount })}</div>
          )}
        </div>
        <div className="card">
          <div className="stat-label">{t("dashboard.expensesLabel")}</div>
          <div className="stat-value">{fmtEUR(expenseSum, lang)}</div>
          <div className="stat-sub">{t("dashboard.expenseItemsCount", { count: expensesThisYear.length })}</div>
        </div>
        <div className="card">
          <div className="stat-label">{t("dashboard.profit")}</div>
          <div className="stat-value">{fmtEUR(profit, lang)}</div>
          <div className="stat-sub">{t("dashboard.profitNote")}</div>
        </div>
      </div>

      {stats.openInvoicesCount > 0 && (
        <div className="card">
          <div className="stat-label">{t("dashboard.openInvoices")}</div>
          <div className="stat-value">{fmtEUR(stats.openSum, lang)}</div>
          <div className="stat-sub">
            {t("dashboard.openInvoicesNote", { count: stats.openInvoicesCount })}
            <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => onTab("invoices")}>
              {t("dashboard.openInvoicesLink")}
            </span>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="stat-label" style={{ marginBottom: 12 }}>
          {t("dashboard.limitsTitle")}
        </div>
        <div className="gauge">
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 3 }}>
            {t("dashboard.prevYearGaugeLabel", { limit: fmtEUR(25000, lang) })}
          </div>
          <div className="gauge-track">
            <div className={`gauge-fill ${prevState}`} style={{ width: `${prevPct}%` }} />
          </div>
          <div className="gauge-ticks">
            <span>{fmtEUR(0, lang)}</span>
            <span>{fmtEUR(prevYearRevenue, lang)}</span>
            <span>{fmtEUR(25000, lang)}</span>
          </div>
        </div>
        <div className="gauge" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 3 }}>
            {t("dashboard.currentYearGaugeLabel", { limit: fmtEUR(100000, lang) })}
          </div>
          <div className="gauge-track">
            <div className={`gauge-fill ${curState}`} style={{ width: `${curPct}%` }} />
          </div>
          <div className="gauge-ticks">
            <span>{fmtEUR(0, lang)}</span>
            <span>{fmtEUR(revenueThisYearGross, lang)}</span>
            <span>{fmtEUR(100000, lang)}</span>
          </div>
        </div>
        <div className="gauge-caption">{t("dashboard.limitsCaption")}</div>
      </div>
      <p style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 18 }}>{t("dashboard.disclaimer")}</p>
    </>
  );
}
