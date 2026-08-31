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
import type {
  Expense,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  Invoice,
  InvoiceCreateInput,
  Settings,
  Tab,
} from "./types";

export default function App() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [invoiceViewId, setInvoiceViewId] = useState<number | null>(null);

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

  async function handleCreateInvoice(payload: InvoiceCreateInput) {
    const created = await api.createInvoice(payload);
    await refreshInvoices();
    setInvoiceViewId(created.id);
    setTab("invoiceDetail");
  }
  async function handleMarkPaid(id: number) {
    await api.markInvoicePaid(id);
    await refreshInvoices();
  }
  async function handleMarkOpen(id: number) {
    await api.markInvoiceOpen(id);
    await refreshInvoices();
  }
  async function handleDeleteInvoice(id: number) {
    await api.deleteInvoice(id);
    await refreshInvoices();
    setTab("invoices");
  }
  async function handleCreateExpense(payload: ExpenseCreateInput) {
    await api.createExpense(payload);
    await refreshExpenses();
  }
  async function handleUpdateExpense(id: number, payload: ExpenseUpdateInput) {
    await api.updateExpense(id, payload);
    await refreshExpenses();
  }
  async function handleDeleteExpense(id: number) {
    await api.deleteExpense(id);
    await refreshExpenses();
  }
  async function handleSaveSettings(data: Settings) {
    const saved = await api.saveSettings(data);
    setSettings(saved);
  }

  function goTab(next: Tab) {
    setTab(next);
  }

  const currentInvoice = invoices.find((i) => i.id === invoiceViewId) || null;

  return (
    <div className="shell">
      <Sidebar tab={tab} onTab={goTab} businessName={settings.business_name} />
      <div className="main">
        <div className="main-inner">
          {tab === "dashboard" && (
            <Dashboard settings={settings} invoices={invoices} expenses={expenses} onTab={goTab} />
          )}

          {tab === "invoices" && (
            <InvoiceList
              invoices={invoices}
              onNew={() => setTab("invoiceNew")}
              onView={(id) => {
                setInvoiceViewId(id);
                setTab("invoiceDetail");
              }}
              onMarkPaid={handleMarkPaid}
              onMarkOpen={handleMarkOpen}
            />
          )}

          {tab === "invoiceNew" && (
            <InvoiceForm settings={settings} onCancel={() => setTab("invoices")} onSubmit={handleCreateInvoice} />
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
            <Expenses
              expenses={expenses}
              onCreate={handleCreateExpense}
              onUpdate={handleUpdateExpense}
              onDelete={handleDeleteExpense}
            />
          )}

          {tab === "settings" && <SettingsPage settings={settings} onSave={handleSaveSettings} />}
        </div>
      </div>
    </div>
  );
}
