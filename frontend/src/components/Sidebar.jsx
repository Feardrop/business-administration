import { ApertureMark, IconDashboard, IconInvoices, IconExpenses, IconSettings } from "./Icons";

export default function Sidebar({ tab, onTab, businessName }) {
  const items = [
    { key: "dashboard", label: "Übersicht", icon: <IconDashboard /> },
    { key: "invoices", label: "Rechnungen", icon: <IconInvoices />, activeAlso: ["invoiceNew", "invoiceDetail"] },
    { key: "expenses", label: "Ausgaben", icon: <IconExpenses /> },
    { key: "settings", label: "Einstellungen", icon: <IconSettings /> },
  ];
  return (
    <div className="sidebar">
      <div className="brand">
        <ApertureMark size={30} />
        <div className="brand-text">
          <div className="brand-title">{businessName || "Meine Fotografie"}</div>
          <div className="brand-sub">Gewerbe-Verwaltung</div>
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
      <div className="sidebar-foot">Self-gehostet · keine Steuerberatung</div>
    </div>
  );
}
