import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { fmtEUR, todayISO } from "../utils";
import { IconBack, IconPlus } from "../components/Icons";
import type { Invoice, InvoiceCreateInput, Settings } from "../types";

interface InvoiceFormProps {
  settings: Settings;
  // The draft being edited, or null/undefined for a brand-new invoice.
  // Only ever a draft — issued invoices are immutable via this form (the
  // caller is responsible for not routing here for a non-draft).
  invoice?: Invoice | null;
  onCancel: () => void;
  // Persists the current form contents as a draft (create or PATCH,
  // depending on whether `invoice` was passed) without issuing it.
  onSaveDraft: (payload: InvoiceCreateInput) => Promise<void>;
  // Persists the current form contents, then issues the invoice — the
  // one-way transition that assigns the number and locks the record.
  onIssue: (payload: InvoiceCreateInput) => Promise<void>;
}

interface FormItem {
  desc: string;
  qty: number | string;
  price: number | string;
}

export default function InvoiceForm({ settings, invoice, onCancel, onSaveDraft, onIssue }: InvoiceFormProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "de";
  const isEditing = Boolean(invoice);
  const [date, setDate] = useState(invoice?.date || todayISO());
  const [clientName, setClientName] = useState(invoice?.client_name || "");
  const [clientAddress, setClientAddress] = useState(invoice?.client_address || "");
  const [note, setNote] = useState(invoice?.note || "");
  const [vatRate, setVatRate] = useState(invoice?.vat_rate ? String(Number(invoice.vat_rate)) : "19");
  const [items, setItems] = useState<FormItem[]>(
    invoice?.items?.length
      ? invoice.items.map((it) => ({ desc: it.description, qty: it.qty, price: it.price }))
      : [{ desc: "", qty: 1, price: 0 }]
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState<"draft" | "issue" | null>(null);

  const net = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const vat = settings.kleinunternehmer ? 0 : (net * Number(vatRate)) / 100;

  function updateItem<K extends keyof FormItem>(idx: number, field: K, value: FormItem[K]) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { desc: "", qty: 1, price: 0 }]);
  }
  function removeItem(idx: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  function buildPayload(): InvoiceCreateInput | null {
    const cleanItems = items
      .map((it) => ({ description: (it.desc || "").trim(), qty: Number(it.qty) || 0, price: Number(it.price) || 0 }))
      .filter((it) => it.description !== "" || it.qty > 0 || it.price > 0);
    if (cleanItems.length === 0) {
      setError(t("invoiceForm.validationNeedsItem"));
      return null;
    }
    return {
      date,
      client_name: clientName,
      client_address: clientAddress,
      vat_rate: settings.kleinunternehmer ? 0 : Number(vatRate),
      note,
      items: cleanItems,
    };
  }

  async function handleSaveDraft(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting("draft");
    try {
      await onSaveDraft(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invoiceForm.saveError"));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleIssue(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting("issue");
    try {
      await onIssue(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invoiceForm.saveError"));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            <IconBack /> {t("common.back")}
          </button>
        </div>
      </div>
      <h2 style={{ marginBottom: 16 }}>{isEditing ? t("invoiceForm.titleEdit") : t("invoiceForm.title")}</h2>
      {error && <div className="banner banner-amber">{error}</div>}
      <form onSubmit={handleSaveDraft}>
        <div className="card">
          <div className="field-row">
            <div className="field">
              <label>{t("invoiceForm.numberLabel")}</label>
              <input type="text" className="mono" value={invoice?.number || t("invoiceForm.numberPending")} disabled />
            </div>
            <div className="field">
              <label>{t("invoiceForm.dateLabel")}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <label>{t("invoiceForm.clientNameLabel")}</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
              placeholder={t("invoiceForm.clientNamePlaceholder")}
            />
          </div>
          <div className="field">
            <label>{t("invoiceForm.clientAddressLabel")}</label>
            <textarea
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder={t("invoiceForm.clientAddressPlaceholder")}
            />
          </div>
        </div>

        <div className="card">
          <label
            style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 10 }}
          >
            {t("invoiceForm.itemsLabel")}
          </label>
          {items.map((it, idx) => (
            <div className="item-row" key={idx}>
              <input
                type="text"
                placeholder={t("invoiceForm.itemDescPlaceholder")}
                value={it.desc}
                onChange={(e) => updateItem(idx, "desc", e.target.value)}
              />
              <input
                type="number"
                min="0"
                step="1"
                placeholder={t("invoiceForm.itemQtyPlaceholder")}
                value={it.qty}
                onChange={(e) => updateItem(idx, "qty", e.target.value)}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t("invoiceForm.itemPricePlaceholder")}
                value={it.price}
                onChange={(e) => updateItem(idx, "price", e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeItem(idx)}
                title={t("invoiceForm.removeItemTitle")}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={addItem}>
            <IconPlus /> {t("invoiceForm.addItem")}
          </button>

          {!settings.kleinunternehmer && (
            <div className="field" style={{ maxWidth: 260, marginTop: 16 }}>
              <label>{t("invoiceForm.vatRateLabel")}</label>
              <select value={vatRate} onChange={(e) => setVatRate(e.target.value)}>
                <option value="19">{t("invoiceForm.vatOption19")}</option>
                <option value="7">{t("invoiceForm.vatOption7")}</option>
                <option value="0">{t("invoiceForm.vatOption0")}</option>
              </select>
            </div>
          )}

          <div className="item-total-line">
            <span className="lbl">{t("invoiceForm.subtotalNet")}</span>
            <span className="val">{fmtEUR(net, lang)}</span>
          </div>
          {!settings.kleinunternehmer && (
            <div className="item-total-line">
              <span className="lbl">{t("invoiceForm.vat")}</span>
              <span className="val">{fmtEUR(vat, lang)}</span>
            </div>
          )}
          <div className="item-total-line">
            <span className="lbl" style={{ fontWeight: 600 }}>
              {t("invoiceForm.total")}
            </span>
            <span className="val" style={{ fontSize: 16 }}>
              {fmtEUR(net + vat, lang)}
            </span>
          </div>
        </div>

        <div className="card">
          <div className="field">
            <label>{t("invoiceForm.noteLabel")}</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("invoiceForm.notePlaceholder")}
            />
          </div>
        </div>

        <div className="actions" style={{ marginTop: 6 }}>
          <button type="submit" className="btn" disabled={submitting !== null}>
            {t("invoiceForm.saveDraft")}
          </button>
          <button type="button" className="btn btn-primary" disabled={submitting !== null} onClick={handleIssue}>
            {t("invoiceForm.issue")}
          </button>
        </div>
      </form>
    </>
  );
}
