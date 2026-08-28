import { fmtDate, fmtEUR, invoiceTotals } from "../utils";
import { IconPlus } from "../components/Icons";

export default function InvoiceList({ invoices, onNew, onView, onMarkPaid, onMarkOpen }) {
  const list = [...invoices].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="page-head">
        <div><h2>Rechnungen</h2><p>{list.length} Rechnung(en) insgesamt</p></div>
        <div className="actions">
          <button className="btn btn-primary" onClick={onNew}><IconPlus /> Neue Rechnung</button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="card empty">
          <h3>Noch keine Rechnungen</h3>
          <p>Lege deine erste Rechnung an, sobald der erste Auftrag steht.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: "8px 20px" }}>
          <table>
            <thead>
              <tr><th>Nr.</th><th>Datum</th><th>Kunde</th><th className="num">Betrag</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((inv) => {
                const t = invoiceTotals(inv);
                return (
                  <tr key={inv.id}>
                    <td className="mono" style={{ cursor: "pointer" }} onClick={() => onView(inv.id)}>{inv.number}</td>
                    <td>{fmtDate(inv.date)}</td>
                    <td>{inv.client_name}</td>
                    <td className="num">{fmtEUR(t.gross)}</td>
                    <td>{inv.status === "bezahlt" ? <span className="badge badge-paid">bezahlt</span> : <span className="badge badge-open">offen</span>}</td>
                    <td>
                      <div className="row-actions">
                        {inv.status === "offen" ? (
                          <button className="btn btn-sm" onClick={() => onMarkPaid(inv.id)}>Als bezahlt markieren</button>
                        ) : (
                          <button className="btn btn-sm btn-ghost" onClick={() => onMarkOpen(inv.id)}>Zurücksetzen</button>
                        )}
                        <button className="btn btn-sm btn-ghost" onClick={() => onView(inv.id)}>Ansehen</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
