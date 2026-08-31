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
  PaymentCreateInput,
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
  // Set while editing an existing draft via InvoiceForm; null for a
  // brand-new invoice. Drafts are the only invoices ever routed here.
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);

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

  // Persists the form's contents as a draft: creates a new one, or PATCHes
  // the draft being edited (editingInvoiceId set by goEditInvoice below).
  async function handleSaveDraft(payload: InvoiceCreateInput) {
    const saved = editingInvoiceId
      ? await api.updateInvoiceDraft(editingInvoiceId, payload)
      : await api.createInvoice(payload);
    await refreshInvoices();
    setInvoiceViewId(saved.id);
    setEditingInvoiceId(null);
    setTab("invoiceDetail");
  }
  // Persists the form's contents (same as handleSaveDraft), then issues it
  // in the same action — the one-way transition that burns the number.
  async function handleIssueFromForm(payload: InvoiceCreateInput) {
    const saved = editingInvoiceId
      ? await api.updateInvoiceDraft(editingInvoiceId, payload)
      : await api.createInvoice(payload);
    await api.issueInvoice(saved.id);
    await refreshInvoices();
    setInvoiceViewId(saved.id);
    setEditingInvoiceId(null);
    setTab("invoiceDetail");
  }
  async function handleIssueInvoice(id: number) {
    await api.issueInvoice(id);
    await refreshInvoices();
  }
  // A boolean paid/open toggle doesn't fit a many-payments ledger (issue
  // #30) -- these replace the old handleMarkPaid/handleMarkOpen.
  async function handleRecordPayment(id: number, payload: PaymentCreateInput) {
    await api.recordPayment(id, payload);
    await refreshInvoices();
  }
  async function handleDeletePayment(invoiceId: number, paymentId: number) {
    await api.deletePayment(invoiceId, paymentId);
    await refreshInvoices();
  }
  async function handleDeleteInvoice(id: number) {
    await api.deleteInvoice(id);
    await refreshInvoices();
    setTab("invoices");
  }
  async function handleCancelInvoice(id: number, reason: string) {
    const cancellation = await api.cancelInvoice(id, reason);
    await refreshInvoices();
    // Jump straight to the new cancellation invoice -- it's the real
    // outcome of this action, not the (now storniert) original.
    setInvoiceViewId(cancellation.id);
  }
  async function handleCancelAndCorrectInvoice(id: number, reason: string) {
    const result = await api.cancelAndCorrectInvoice(id, reason);
    await refreshInvoices();
    // Land the user directly on the corrected draft, ready to edit.
    setEditingInvoiceId(result.draft.id);
    setTab("invoiceNew");
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
  function goNewInvoice() {
    setEditingInvoiceId(null);
    setTab("invoiceNew");
  }
  function goEditInvoice(id: number) {
    setEditingInvoiceId(id);
    setTab("invoiceNew");
  }

  const currentInvoice = invoices.find((i) => i.id === invoiceViewId) || null;
  const editingInvoice = invoices.find((i) => i.id === editingInvoiceId) || null;

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
              settings={settings}
              onNew={goNewInvoice}
              onView={(id) => {
                setInvoiceViewId(id);
                setTab("invoiceDetail");
              }}
              onEdit={goEditInvoice}
            />
          )}

          {tab === "invoiceNew" && (
            <InvoiceForm
              settings={settings}
              invoice={editingInvoice}
              onCancel={() => {
                if (editingInvoice) {
                  setInvoiceViewId(editingInvoice.id);
                  setTab("invoiceDetail");
                } else {
                  setTab("invoices");
                }
              }}
              onSaveDraft={handleSaveDraft}
              onIssue={handleIssueFromForm}
            />
          )}

          {tab === "invoiceDetail" && (
            <InvoiceDetail
              invoice={currentInvoice}
              invoices={invoices}
              settings={settings}
              onBack={() => setTab("invoices")}
              onEdit={goEditInvoice}
              onIssue={handleIssueInvoice}
              onRecordPayment={handleRecordPayment}
              onDeletePayment={handleDeletePayment}
              onDelete={handleDeleteInvoice}
              onCancel={handleCancelInvoice}
              onCancelAndCorrect={handleCancelAndCorrectInvoice}
              onViewInvoice={(id) => setInvoiceViewId(id)}
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
