import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fmtDate, fmtEUR, invoiceTotals } from "../utils";
import { IconBack, IconPrint, IconTrash } from "../components/Icons";

// The printable invoice document below (.invoice-doc) intentionally stays in
// German regardless of the app's UI language: it's the legal invoice text
// sent to clients under German tax law (§19 UStG), not app chrome — it must
// not follow the admin's language preference.
export default function InvoiceDetail({ invoice, settings, onBack, onMarkPaid, onMarkOpen, onDelete }) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!invoice)
    return (
      <p>
        {t("invoiceDetail.notFound")}{" "}
        <button className="btn btn-sm" onClick={onBack}>
          {t("common.back")}
        </button>
      </p>
    );
  const total = invoiceTotals(invoice);
  const s = settings;

  return (
    <>
      <div className="page-head no-print">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            <IconBack /> {t("common.back")}
          </button>
        </div>
        <div className="actions">
          {invoice.status === "offen" ? (
            <button className="btn btn-sm" onClick={() => onMarkPaid(invoice.id)}>
              {t("common.markPaid")}
            </button>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={() => onMarkOpen(invoice.id)}>
              {t("invoiceDetail.markOpen")}
            </button>
          )}
          <button className="btn btn-sm" onClick={() => window.print()}>
            <IconPrint /> {t("invoiceDetail.print")}
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>
            <IconTrash /> {t("common.delete")}
          </button>
        </div>
      </div>
      {confirmDelete && (
        <div className="banner banner-amber no-print">
          {t("invoiceDetail.confirmDeleteText")}
          <button className="btn btn-sm btn-danger" style={{ marginLeft: 8 }} onClick={() => onDelete(invoice.id)}>
            {t("invoiceDetail.confirmDeleteYes")}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(false)}>
            {t("common.cancel")}
          </button>
        </div>
      )}

      <div className="invoice-doc">
        <div className="invoice-doc-head">
          <div className="from">
            {s.business_name}
            {s.owner_name ? `\n${s.owner_name}` : ""}
            {s.address ? `\n${s.address}` : ""}
            {s.tax_number ? `\nSt.-Nr.: ${s.tax_number}` : ""}
          </div>
          <div className="meta">
            <div>Rechnungsnummer</div>
            <div className="num">{invoice.number}</div>
            <div style={{ marginTop: 8 }}>Rechnungsdatum</div>
            <div>{fmtDate(invoice.date, "de")}</div>
          </div>
        </div>
        <h1 className="title">Rechnung</h1>
        <div className="to-block">
          {invoice.client_name}
          {invoice.client_address ? `\n${invoice.client_address}` : ""}
        </div>
        <table>
          <thead>
            <tr>
              <th>Position</th>
              <th className="num">Menge</th>
              <th className="num">Einzelpreis</th>
              <th className="num">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td className="num">{it.qty}</td>
                <td className="num">{fmtEUR(it.price, "de")}</td>
                <td className="num">{fmtEUR((Number(it.qty) || 0) * (Number(it.price) || 0), "de")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <div className="line">
            <span>Nettobetrag</span>
            <span className="mono">{fmtEUR(total.net, "de")}</span>
          </div>
          {!invoice.is_kleinunternehmer && (
            <div className="line">
              <span>zzgl. {invoice.vat_rate}% USt</span>
              <span className="mono">{fmtEUR(total.vat, "de")}</span>
            </div>
          )}
          <div className="line grand">
            <span>Gesamtbetrag</span>
            <span>{fmtEUR(total.gross, "de")}</span>
          </div>
        </div>
        <div className="footnote">
          {invoice.is_kleinunternehmer && "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."}
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
