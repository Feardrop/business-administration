import { useTranslation } from "react-i18next";
import { ApertureMark, IconDashboard, IconInvoices, IconExpenses, IconSettings } from "./Icons";

export default function Sidebar({ tab, onTab, businessName }) {
  const { t, i18n } = useTranslation();
  const items = [
    { key: "dashboard", label: t("nav.dashboard"), icon: <IconDashboard /> },
    { key: "invoices", label: t("nav.invoices"), icon: <IconInvoices />, activeAlso: ["invoiceNew", "invoiceDetail"] },
    { key: "expenses", label: t("nav.expenses"), icon: <IconExpenses /> },
    { key: "settings", label: t("nav.settings"), icon: <IconSettings /> },
  ];
  const lang = i18n.language?.startsWith("en") ? "en" : "de";
  return (
    <div className="sidebar">
      <div className="brand">
        <ApertureMark size={30} />
        <div className="brand-text">
          <div className="brand-title">{businessName || t("nav.brandFallback")}</div>
          <div className="brand-sub">{t("nav.brandSub")}</div>
        </div>
      </div>
      <div className="navlist">
        {items.map((it) => {
          const active = tab === it.key || (it.activeAlso && it.activeAlso.includes(tab));
          return (
            <button key={it.key} className={`navbtn ${active ? "active" : ""}`} onClick={() => onTab(it.key)}>
              {it.icon} {it.label}
            </button>
          );
        })}
      </div>
      <div className="lang-switch" aria-label={t("nav.language")}>
        <button className={`btn btn-sm ${lang === "de" ? "btn-primary" : "btn-ghost"}`} onClick={() => i18n.changeLanguage("de")}>DE</button>
        <button className={`btn btn-sm ${lang === "en" ? "btn-primary" : "btn-ghost"}`} onClick={() => i18n.changeLanguage("en")}>EN</button>
      </div>
      <div className="sidebar-foot">{t("nav.footer")}</div>
    </div>
  );
}
