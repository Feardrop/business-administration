import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { amountDue, amountPaid, fmtDate, fmtEUR, invoiceTotals, PAYMENT_METHODS, todayISO } from "../utils";
import { IconBack, IconPrint, IconTrash } from "../components/Icons";
import type { Invoice, PaymentCreateInput, Settings } from "../types";

interface InvoiceDetailProps {
  invoice: Invoice | null;
  // Full invoice list, used only to resolve the number of a linked
  // cancellation/cancelled invoice (see cancellationInvoice/cancelledInvoice
  // below) -- the current invoice only carries the related invoice's id.
  invoices: Invoice[];
  settings: Settings;
  onBack: () => void;
  onEdit: (id: number) => void;
  onIssue: (id: number) => Promise<void>;
  onRecordPayment: (id: number, data: PaymentCreateInput) => Promise<void>;
  onDeletePayment: (invoiceId: number, paymentId: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onCancel: (id: number, reason: string) => Promise<void>;
  onCancelAndCorrect: (id: number, reason: string) => Promise<void>;
  onViewInvoice: (id: number) => void;
}

// The printable invoice document below (.invoice-doc) intentionally stays in
// German regardless of the app's UI language: it's the legal invoice text
// sent to clients under German tax law (§19 UStG), not app chrome — it must
// not follow the admin's language preference. The draft watermark added to
// it below follows the same rule (fixed German, not run through t()) since
// it's part of the same printable surface.
export default function InvoiceDetail({
  invoice,
  invoices,
  settings,
  onBack,
  onEdit,
  onIssue,
  onRecordPayment,
  onDeletePayment,
  onDelete,
  onCancel,
  onCancelAndCorrect,
  onViewInvoice,
}: InvoiceDetailProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "de";
  const [confirmDelete, setConfirmDelete] = useState(false);
  // "cancel" / "cancelAndCorrect" show the reason-entry step for that
  // action; "none" hides it. Kept as one piece of state since only one of
  // the two can be in progress at a time.
  const [cancelMode, setCancelMode] = useState<"none" | "cancel" | "cancelAndCorrect">("none");
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [paymentNote, setPaymentNote] = useState("");
  if (!invoice)
    return (
      <p>
        {t("invoiceDetail.notFound")}{" "}
        <button className="btn btn-sm" onClick={onBack}>
          {t("common.back")}
        </button>
      </p>
    );
  const isDraft = invoice.status === "draft";
  // Only an already-issued, not-yet-cancelled invoice can be cancelled
  // (issue #26) -- a draft is just deleted, and "storniert" is terminal.
  // "teilweise bezahlt" (issue #30) is cancellable too -- a partial
  // payment doesn't change that §14c UStG still requires a formal
  // counter-document to reverse the invoice.
  const isCancellable =
    invoice.status === "offen" || invoice.status === "teilweise bezahlt" || invoice.status === "bezahlt";
  const cancellationInvoice = invoice.cancellation_invoice_id
    ? invoices.find((i) => i.id === invoice.cancellation_invoice_id) || null
    : null;
  const cancelledInvoice = invoice.cancels_invoice_id
    ? invoices.find((i) => i.id === invoice.cancels_invoice_id) || null
    : null;
  const invForTotals = { ...invoice, is_kleinunternehmer: invoice.is_kleinunternehmer ?? settings.kleinunternehmer };
  const total = invoiceTotals(invForTotals);
  const s = settings;
  // Payments can only be recorded against an already-issued, not-yet-
  // cancelled invoice (issue #30) -- "bezahlt" stays payable too, for a
  // correction or an intentional (flagged, never rejected) overpayment.
  const isPayable =
    invoice.status === "offen" || invoice.status === "teilweise bezahlt" || invoice.status === "bezahlt";
  const paid = amountPaid(invForTotals);
  const due = amountDue(invForTotals);

  function startCancel(mode: "cancel" | "cancelAndCorrect") {
    setCancelMode(mode);
    setCancelReason("");
    setError("");
  }

  async function confirmCancel() {
    if (!invoice) return;
    await withErrorHandling(async () => {
      if (cancelMode === "cancel") {
        await onCancel(invoice.id, cancelReason);
      } else if (cancelMode === "cancelAndCorrect") {
        await onCancelAndCorrect(invoice.id, cancelReason);
      }
      setCancelMode("none");
      setCancelReason("");
    });
  }

  async function withErrorHandling(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invoiceForm.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    await withErrorHandling(async () => {
      await onRecordPayment(invoice.id, {
        amount: paymentAmount,
        date: paymentDate || undefined,
        method: paymentMethod,
        note: paymentNote || undefined,
      });
      setPaymentAmount("");
      setPaymentDate(todayISO());
      setPaymentNote("");
    });
  }

  async function removePayment(paymentId: number) {
    if (!invoice) return;
    await withErrorHandling(() => onDeletePayment(invoice.id, paymentId));
  }

  return (
    <>
      <div className="page-head no-print">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            <IconBack /> {t("common.back")}
          </button>
        </div>
        <div className="actions">
          {isDraft && (
            <>
              <button className="btn btn-sm" onClick={() => onEdit(invoice.id)} disabled={busy}>
                {t("common.edit")}
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => withErrorHandling(() => onIssue(invoice.id))}
                disabled={busy}
              >
                {t("invoiceDetail.issue")}
              </button>
            </>
          )}
          {!isDraft && (
            <button className="btn btn-sm" onClick={() => window.print()}>
              <IconPrint /> {t("invoiceDetail.print")}
            </button>
          )}
          {isDraft && (
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>
              <IconTrash /> {t("common.delete")}
            </button>
          )}
          {isCancellable && (
            <>
              <button className="btn btn-sm btn-danger" onClick={() => startCancel("cancel")} disabled={busy}>
                {t("invoiceDetail.cancelInvoice")}
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => startCancel("cancelAndCorrect")} disabled={busy}>
                {t("invoiceDetail.cancelAndCorrect")}
              </button>
            </>
          )}
        </div>
      </div>
      {error && <div className="banner banner-amber no-print">{error}</div>}
      {invoice.status === "storniert" && (
        <div className="banner banner-amber no-print">
          <div>{t("invoiceDetail.cancelledBanner", { date: fmtDate(invoice.cancelled_at, lang) })}</div>
          {invoice.cancel_reason && (
            <div>
              {t("invoiceDetail.cancelReasonLabel")}: {invoice.cancel_reason}
            </div>
          )}
          {cancellationInvoice && (
            <div style={{ marginTop: 6 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => onViewInvoice(cancellationInvoice.id)}>
                {t("invoiceDetail.viewCancellationInvoice", { number: cancellationInvoice.number })}
              </button>
            </div>
          )}
        </div>
      )}
      {cancelledInvoice && (
        <div className="banner no-print">
          {t("invoiceDetail.cancelsInvoiceNote", { number: cancelledInvoice.number })}{" "}
          <button className="btn btn-sm btn-ghost" onClick={() => onViewInvoice(cancelledInvoice.id)}>
            {t("common.view")}
          </button>
        </div>
      )}
      {cancelMode !== "none" && (
        <div className="banner banner-amber no-print">
          <div>
            {cancelMode === "cancel" ? t("invoiceDetail.cancelPrompt") : t("invoiceDetail.cancelAndCorrectPrompt")}
          </div>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder={t("invoiceDetail.cancelReasonPlaceholder")}
            rows={2}
            style={{ width: "100%", marginTop: 8 }}
          />
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button className="btn btn-sm btn-danger" disabled={busy || !cancelReason.trim()} onClick={confirmCancel}>
              {t("invoiceDetail.confirmCancel")}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setCancelMode("none");
                setCancelReason("");
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="banner banner-amber no-print">
          {t("invoiceDetail.confirmDeleteText")}
          <button
            className="btn btn-sm btn-danger"
            style={{ marginLeft: 8 }}
            onClick={() => withErrorHandling(() => onDelete(invoice.id))}
          >
            {t("invoiceDetail.confirmDeleteYes")}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(false)}>
            {t("common.cancel")}
          </button>
        </div>
      )}

      {/* The payment ledger (issue #30) -- replaces the old single
          "mark paid"/"mark open" toggle. Only shown for an issued
          invoice; a draft can't have payments yet. */}
      {!isDraft && (
        <div className="card no-print" style={{ marginBottom: 16 }}>
          <div className="stat-label" style={{ marginBottom: 12 }}>
            {t("invoiceDetail.paymentsTitle")}
          </div>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div className="stat-sub">{t("invoiceDetail.amountPaidLabel")}</div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {fmtEUR(paid, lang)}
              </div>
            </div>
            <div>
              <div className="stat-sub">{t("invoiceDetail.amountDueLabel")}</div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {fmtEUR(due, lang)}
              </div>
            </div>
          </div>
          {invoice.overpaid && (
            <div className="banner banner-amber" style={{ marginBottom: 12 }}>
              {t("invoiceDetail.overpaidWarning")}
            </div>
          )}
          {invoice.payments.length > 0 ? (
            <table style={{ marginBottom: isPayable ? 16 : 0 }}>
              <thead>
                <tr>
                  <th>{t("fields.date")}</th>
                  <th className="num">{t("fields.amount")}</th>
                  <th>{t("invoiceDetail.paymentMethodLabel")}</th>
                  <th>{t("fields.description")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.date, lang)}</td>
                    <td className="num">{fmtEUR(p.amount, lang)}</td>
                    <td>{t(`invoiceDetail.paymentMethods.${p.method}`, p.method || "–")}</td>
                    <td>{p.note || "–"}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => removePayment(p.id)}
                        disabled={busy}
                        title={t("invoiceDetail.deletePayment")}
                      >
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="stat-sub">{t("invoiceDetail.noPayments")}</p>
          )}
          {isPayable && (
            <form
              onSubmit={submitPayment}
              style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
            >
              <div>
                <label>{t("fields.amount")}</label>
                <br />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  style={{ width: 110 }}
                />
              </div>
              <div>
                <label>{t("fields.date")}</label>
                <br />
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div>
                <label>{t("invoiceDetail.paymentMethodLabel")}</label>
                <br />
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`invoiceDetail.paymentMethods.${m}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label>{t("fields.description")}</label>
                <br />
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
              <button className="btn btn-sm btn-primary" type="submit" disabled={busy || !paymentAmount}>
                {t("invoiceDetail.recordPayment")}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="invoice-doc">
        {isDraft && (
          <div className="banner banner-amber no-print" style={{ marginBottom: 16 }}>
            ENTWURF – noch keine gültige Rechnung, keine Rechnungsnummer vergeben.
          </div>
        )}
        <div className="invoice-doc-head">
          <div className="from">
            {s.business_name}
            {s.owner_name ? `\n${s.owner_name}` : ""}
            {s.address ? `\n${s.address}` : ""}
            {s.tax_number ? `\nSt.-Nr.: ${s.tax_number}` : ""}
            {s.ust_id_nr ? `\nUSt-IdNr.: ${s.ust_id_nr}` : ""}
          </div>
          <div className="meta">
            <div>Rechnungsnummer</div>
            <div className="num">{invoice.number || "–"}</div>
            <div style={{ marginTop: 8 }}>Rechnungsdatum</div>
            <div>{fmtDate(invoice.date, "de")}</div>
            {(invoice.service_date || invoice.service_period_text) && (
              <>
                {/* §14 Abs. 4 Nr. 6 UStG: when the service was actually
                    rendered — not the same as the document date above.
                    service_date takes priority if both are somehow set. */}
                <div style={{ marginTop: 8 }}>{invoice.service_date ? "Leistungsdatum" : "Leistungszeitraum"}</div>
                <div>{invoice.service_date ? fmtDate(invoice.service_date, "de") : invoice.service_period_text}</div>
              </>
            )}
          </div>
        </div>
        <h1 className="title">Rechnung</h1>
        <div className="to-block">
          {invoice.client_name}
          {invoice.client_address ? `\n${invoice.client_address}` : ""}
        </div>
        {/* is_kleinunternehmer is null only on a still-unissued draft;
            resolved against the current setting for the same reason
            `total` below is. */}
        {(() => {
          const showVat = !(invoice.is_kleinunternehmer ?? settings.kleinunternehmer);
          return (
            <table>
              <thead>
                <tr>
                  <th>Position</th>
                  <th className="num">Menge</th>
                  <th className="num">Einzelpreis</th>
                  {showVat && <th className="num">USt</th>}
                  <th className="num">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((it) => (
                  <tr key={it.id}>
                    <td>{it.description}</td>
                    <td className="num">{it.qty}</td>
                    <td className="num">{fmtEUR(it.price, "de")}</td>
                    {showVat && <td className="num">{Number(it.vat_rate)}%</td>}
                    <td className="num">{fmtEUR((Number(it.qty) || 0) * (Number(it.price) || 0), "de")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
        <div className="totals">
          <div className="line">
            <span>Nettobetrag</span>
            <span className="mono">{fmtEUR(total.net, "de")}</span>
          </div>
          {/* Per-rate breakdown (§14 UStG) — one line per distinct rate
              present on the invoice's items, not a single combined VAT
              line. Always empty for a Kleinunternehmer invoice, regardless
              of what the (now-irrelevant) per-line rates happen to be. */}
          {total.breakdown.map((b) => (
            <div className="line" key={b.vat_rate}>
              <span>
                zzgl. {b.vat_rate}% USt auf {fmtEUR(b.net, "de")}
              </span>
              <span className="mono">{fmtEUR(b.vat, "de")}</span>
            </div>
          ))}
          <div className="line grand">
            <span>Gesamtbetrag</span>
            <span>{fmtEUR(total.gross, "de")}</span>
          </div>
        </div>
        <div className="footnote">
          {(invoice.is_kleinunternehmer ?? settings.kleinunternehmer) &&
            "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."}
          {s.iban && (
            <>
              <br />
              Bitte überweisen Sie den Betrag auf folgendes Konto: {s.iban}
            </>
          )}
        </div>
      </div>
    </>
  );
}
