import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fmtDate, fmtEUR, invoiceTotals } from "../utils";
import { IconBack, IconPrint, IconTrash } from "../components/Icons";
import type { Invoice, Settings } from "../types";

interface InvoiceDetailProps {
  invoice: Invoice | null;
  settings: Settings;
  onBack: () => void;
  onEdit: (id: number) => void;
  onIssue: (id: number) => Promise<void>;
  onMarkPaid: (id: number) => Promise<void>;
  onMarkOpen: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

// The printable invoice document below (.invoice-doc) intentionally stays in
// German regardless of the app's UI language: it's the legal invoice text
// sent to clients under German tax law (§19 UStG), not app chrome — it must
// not follow the admin's language preference. The draft watermark added to
// it below follows the same rule (fixed German, not run through t()) since
// it's part of the same printable surface.
export default function InvoiceDetail({
  invoice,
  settings,
  onBack,
  onEdit,
  onIssue,
  onMarkPaid,
  onMarkOpen,
  onDelete,
}: InvoiceDetailProps) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  const total = invoiceTotals({
    ...invoice,
    is_kleinunternehmer: invoice.is_kleinunternehmer ?? settings.kleinunternehmer,
  });
  const s = settings;

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
          {invoice.status === "offen" && (
            <button className="btn btn-sm" onClick={() => onMarkPaid(invoice.id)}>
              {t("common.markPaid")}
            </button>
          )}
          {invoice.status === "bezahlt" && (
            <button className="btn btn-sm btn-ghost" onClick={() => onMarkOpen(invoice.id)}>
              {t("invoiceDetail.markOpen")}
            </button>
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
        </div>
      </div>
      {error && <div className="banner banner-amber no-print">{error}</div>}
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
