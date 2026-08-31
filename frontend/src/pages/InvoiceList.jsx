import { useTranslation } from "react-i18next";
import { fmtDate, fmtEUR, invoiceTotals } from "../utils";
import { IconPlus } from "../components/Icons";

export default function InvoiceList({ invoices, onNew, onView, onMarkPaid, onMarkOpen }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "de";
  const list = [...invoices].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t("invoiceList.title")}</h2>
          <p>{t("invoiceList.totalCount", { count: list.length })}</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={onNew}>
            <IconPlus /> {t("invoiceList.newInvoice")}
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="card empty">
          <h3>{t("invoiceList.emptyTitle")}</h3>
          <p>{t("invoiceList.emptyText")}</p>
        </div>
      ) : (
        <div className="card" style={{ padding: "8px 20px" }}>
          <table>
            <thead>
              <tr>
                <th>{t("fields.number")}</th>
                <th>{t("fields.date")}</th>
                <th>{t("fields.client")}</th>
                <th className="num">{t("fields.amount")}</th>
                <th>{t("fields.status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => {
                const t2 = invoiceTotals(inv);
                return (
                  <tr key={inv.id}>
                    <td className="mono" style={{ cursor: "pointer" }} onClick={() => onView(inv.id)}>
                      {inv.number}
                    </td>
                    <td>{fmtDate(inv.date, lang)}</td>
                    <td>{inv.client_name}</td>
                    <td className="num">{fmtEUR(t2.gross, lang)}</td>
                    <td>
                      {inv.status === "bezahlt" ? (
                        <span className="badge badge-paid">{t("invoiceList.statusPaid")}</span>
                      ) : (
                        <span className="badge badge-open">{t("invoiceList.statusOpen")}</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {inv.status === "offen" ? (
                          <button className="btn btn-sm" onClick={() => onMarkPaid(inv.id)}>
                            {t("common.markPaid")}
                          </button>
                        ) : (
                          <button className="btn btn-sm btn-ghost" onClick={() => onMarkOpen(inv.id)}>
                            {t("invoiceList.resetToOpen")}
                          </button>
                        )}
                        <button className="btn btn-sm btn-ghost" onClick={() => onView(inv.id)}>
                          {t("common.view")}
                        </button>
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
