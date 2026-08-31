import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "../types";
import { ApertureMark, IconDashboard, IconInvoices, IconExpenses, IconSettings } from "./Icons";

interface SidebarProps {
  tab: Tab;
  onTab: (tab: Tab) => void;
  businessName: string;
}

interface NavItem {
  key: Tab;
  label: string;
  icon: ReactNode;
  activeAlso?: Tab[];
}

export default function Sidebar({ tab, onTab, businessName }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const items: NavItem[] = [
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
        <button
          className={`btn btn-sm ${lang === "de" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => i18n.changeLanguage("de")}
        >
          DE
        </button>
        <button
          className={`btn btn-sm ${lang === "en" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => i18n.changeLanguage("en")}
        >
          EN
        </button>
      </div>
      <div className="sidebar-foot">{t("nav.footer")}</div>
    </div>
  );
}
