import { useTranslation } from "react-i18next";
import { currentYear, fmtEUR, invoiceTotals } from "../utils";
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
  const paidThisYear = invoices.filter(
    (i) => i.status === "bezahlt" && i.paid_date && new Date(i.paid_date).getFullYear() === y
  );
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
          <div className="stat-value">{fmtEUR(income, lang)}</div>
          {vatCollected > 0 ? (
            <div className="stat-sub">{t("dashboard.vatNote", { amount: fmtEUR(vatCollected, lang) })}</div>
          ) : (
            <div className="stat-sub">{t("dashboard.paidInvoicesCount", { count: paidThisYear.length })}</div>
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

      {openInvoices.length > 0 && (
        <div className="card">
          <div className="stat-label">{t("dashboard.openInvoices")}</div>
          <div className="stat-value">{fmtEUR(openSum, lang)}</div>
          <div className="stat-sub">
            {t("dashboard.openInvoicesNote", { count: openInvoices.length })}
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
