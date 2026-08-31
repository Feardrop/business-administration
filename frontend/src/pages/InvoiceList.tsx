import { useTranslation } from "react-i18next";
import { fmtDate, fmtEUR, invoiceTotals } from "../utils";
import { IconPlus } from "../components/Icons";
import type { Invoice, Settings } from "../types";

interface InvoiceListProps {
  invoices: Invoice[];
  settings: Settings;
  onNew: () => void;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onMarkPaid: (id: number) => Promise<void>;
  onMarkOpen: (id: number) => Promise<void>;
}

export default function InvoiceList({
  invoices,
  settings,
  onNew,
  onView,
  onEdit,
  onMarkPaid,
  onMarkOpen,
}: InvoiceListProps) {
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
                const t2 = invoiceTotals({
                  ...inv,
                  is_kleinunternehmer: inv.is_kleinunternehmer ?? settings.kleinunternehmer,
                });
                return (
                  <tr key={inv.id}>
                    <td className="mono" style={{ cursor: "pointer" }} onClick={() => onView(inv.id)}>
                      {inv.number || t("invoiceList.numberPending")}
                    </td>
                    <td>{fmtDate(inv.date, lang)}</td>
                    <td>{inv.client_name}</td>
                    <td className="num">{fmtEUR(t2.gross, lang)}</td>
                    <td>
                      {inv.status === "draft" && (
                        <span className="badge badge-draft">{t("invoiceList.statusDraft")}</span>
                      )}
                      {inv.status === "bezahlt" && (
                        <span className="badge badge-paid">{t("invoiceList.statusPaid")}</span>
                      )}
                      {inv.status === "offen" && (
                        <span className="badge badge-open">{t("invoiceList.statusOpen")}</span>
                      )}
                      {inv.status === "storniert" && (
                        <span className="badge badge-cancelled">{t("invoiceList.statusCancelled")}</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {inv.status === "draft" && (
                          <button className="btn btn-sm" onClick={() => onEdit(inv.id)}>
                            {t("common.edit")}
                          </button>
                        )}
                        {inv.status === "offen" && (
                          <button className="btn btn-sm" onClick={() => onMarkPaid(inv.id)}>
                            {t("common.markPaid")}
                          </button>
                        )}
                        {inv.status === "bezahlt" && (
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
