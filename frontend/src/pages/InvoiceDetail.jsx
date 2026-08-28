import { useState } from "react";
import { fmtDate, fmtEUR, invoiceTotals } from "../utils";
import { IconBack, IconPrint, IconTrash } from "../components/Icons";

export default function InvoiceDetail({ invoice, settings, onBack, onMarkPaid, onMarkOpen, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!invoice) return <p>Rechnung nicht gefunden. <button className="btn btn-sm" onClick={onBack}>Zurück</button></p>;
  const t = invoiceTotals(invoice);
  const s = settings;

  return (
    <>
      <div className="page-head no-print">
        <div><button className="btn btn-ghost btn-sm" onClick={onBack}><IconBack /> Zurück</button></div>
        <div className="actions">
          {invoice.status === "offen" ? (
            <button className="btn btn-sm" onClick={() => onMarkPaid(invoice.id)}>Als bezahlt markieren</button>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={() => onMarkOpen(invoice.id)}>Als offen markieren</button>
          )}
          <button className="btn btn-sm" onClick={() => window.print()}><IconPrint /> Drucken / als PDF speichern</button>
          <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}><IconTrash /> Löschen</button>
        </div>
      </div>
      {confirmDelete && (
        <div className="banner banner-amber no-print">
          Diese Rechnung wirklich löschen?
          <button className="btn btn-sm btn-danger" style={{ marginLeft: 8 }} onClick={() => onDelete(invoice.id)}>Ja, löschen</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(false)}>Abbrechen</button>
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
            <div>Rechnungsnummer</div><div className="num">{invoice.number}</div>
            <div style={{ marginTop: 8 }}>Rechnungsdatum</div><div>{fmtDate(invoice.date)}</div>
          </div>
        </div>
        <h1 className="title">Rechnung</h1>
        <div className="to-block">{invoice.client_name}{invoice.client_address ? `\n${invoice.client_address}` : ""}</div>
        <table>
          <thead><tr><th>Position</th><th className="num">Menge</th><th className="num">Einzelpreis</th><th className="num">Betrag</th></tr></thead>
          <tbody>
            {(invoice.items || []).map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td className="num">{it.qty}</td>
                <td className="num">{fmtEUR(it.price)}</td>
                <td className="num">{fmtEUR((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <div className="line"><span>Nettobetrag</span><span className="mono">{fmtEUR(t.net)}</span></div>
          {!invoice.is_kleinunternehmer && <div className="line"><span>zzgl. {invoice.vat_rate}% USt</span><span className="mono">{fmtEUR(t.vat)}</span></div>}
          <div className="line grand"><span>Gesamtbetrag</span><span>{fmtEUR(t.gross)}</span></div>
        </div>
        <div className="footnote">
          {invoice.is_kleinunternehmer && "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."}
          {s.iban && <><br />Bitte überweisen Sie den Betrag auf folgendes Konto: {s.iban}</>}
        </div>
      </div>
    </>
  );
}
