import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import Sidebar from "./components/Sidebar";
import { ApertureMark } from "./components/Icons";
import Dashboard from "./pages/Dashboard";
import InvoiceList from "./pages/InvoiceList";
import InvoiceForm from "./pages/InvoiceForm";
import InvoiceDetail from "./pages/InvoiceDetail";
import Expenses from "./pages/Expenses";
import SettingsPage from "./pages/SettingsPage";

function nextInvoiceNumber(settings, invoices) {
  const year = new Date().getFullYear();
  const prefix = settings.invoice_prefix ? `${settings.invoice_prefix}-` : "";
  const count = invoices.filter((i) => i.number && i.number.includes(String(year))).length;
  return `${prefix}${year}-${String(count + 1).padStart(3, "0")}`;
}

export default function App() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [invoiceViewId, setInvoiceViewId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, inv, exp] = await Promise.all([api.getSettings(), api.listInvoices(), api.listExpenses()]);
        setSettings(s);
        setInvoices(inv);
        setExpenses(exp);
        if (!s.business_name) setTab("settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !settings) {
    return (
      <div className="loading-screen">
        <ApertureMark size={44} spin />
        <div className="loading-text">{t("loading.data")}</div>
      </div>
    );
  }

  async function refreshInvoices() {
    setInvoices(await api.listInvoices());
  }
  async function refreshExpenses() {
    setExpenses(await api.listExpenses());
  }

  async function handleCreateInvoice(payload) {
    const created = await api.createInvoice(payload);
    await refreshInvoices();
    setInvoiceViewId(created.id);
    setTab("invoiceDetail");
  }
  async function handleMarkPaid(id) {
    await api.markInvoicePaid(id);
    await refreshInvoices();
  }
  async function handleMarkOpen(id) {
    await api.markInvoiceOpen(id);
    await refreshInvoices();
  }
  async function handleDeleteInvoice(id) {
    await api.deleteInvoice(id);
    await refreshInvoices();
    setTab("invoices");
  }
  async function handleCreateExpense(payload) {
    await api.createExpense(payload);
    await refreshExpenses();
  }
  async function handleDeleteExpense(id) {
    await api.deleteExpense(id);
    await refreshExpenses();
  }
  async function handleSaveSettings(data) {
    const saved = await api.saveSettings(data);
    setSettings(saved);
  }

  function goTab(next) {
    setTab(next);
  }

  const currentInvoice = invoices.find((i) => i.id === invoiceViewId) || null;

  return (
    <div className="shell">
      <Sidebar tab={tab} onTab={goTab} businessName={settings.business_name} />
      <div className="main">
        <div className="main-inner">
          {tab === "dashboard" && <Dashboard settings={settings} invoices={invoices} expenses={expenses} onTab={goTab} />}

          {tab === "invoices" && (
            <InvoiceList
              invoices={invoices}
              onNew={() => setTab("invoiceNew")}
              onView={(id) => { setInvoiceViewId(id); setTab("invoiceDetail"); }}
              onMarkPaid={handleMarkPaid}
              onMarkOpen={handleMarkOpen}
            />
          )}

          {tab === "invoiceNew" && (
            <InvoiceForm
              settings={settings}
              nextNumber={nextInvoiceNumber(settings, invoices)}
              onCancel={() => setTab("invoices")}
              onSubmit={handleCreateInvoice}
            />
          )}

          {tab === "invoiceDetail" && (
            <InvoiceDetail
              invoice={currentInvoice}
              settings={settings}
              onBack={() => setTab("invoices")}
              onMarkPaid={handleMarkPaid}
              onMarkOpen={handleMarkOpen}
              onDelete={handleDeleteInvoice}
            />
          )}

          {tab === "expenses" && (
            <Expenses expenses={expenses} onCreate={handleCreateExpense} onDelete={handleDeleteExpense} />
          )}

          {tab === "settings" && <SettingsPage settings={settings} onSave={handleSaveSettings} />}
        </div>
      </div>
    </div>
  );
}
