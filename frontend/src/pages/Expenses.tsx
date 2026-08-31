import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { EXPENSE_CATEGORIES, fmtDate, fmtEUR, isoYear, todayISO, type ExpenseCategory } from "../utils";
import { IconPlus, IconTrash } from "../components/Icons";
import type { Expense, ExpenseCreateInput, ExpenseUpdateInput } from "../types";

interface ExpensesProps {
  expenses: Expense[];
  onCreate: (payload: ExpenseCreateInput) => Promise<void>;
  onUpdate: (id: number, payload: ExpenseUpdateInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

interface EditingState {
  id: number;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
}

export default function Expenses({ expenses, onCreate, onUpdate, onDelete }: ExpensesProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "de";
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<ExpenseCategory>(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingState, setEditingState] = useState<EditingState | null>(null);

  const years = useMemo(
    () => Array.from(new Set(expenses.map((e) => isoYear(e.date)))).sort((a, b) => b - a),
    [expenses]
  );
  const filtered = yearFilter === "all" ? expenses : expenses.filter((e) => String(isoYear(e.date)) === yearFilter);
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const sum = sorted.reduce((s, e) => s + Number(e.amount || 0), 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onCreate({ date, category, description, amount: Number(amount) || 0 });
    setDescription("");
    setAmount("");
  }

  function handleEditStart(expense: Expense) {
    setEditingId(expense.id);
    setEditingState({
      id: expense.id,
      date: expense.date,
      category: expense.category as ExpenseCategory,
      description: expense.description,
      amount: String(Number(expense.amount)),
    });
  }

  async function handleEditSave() {
    if (!editingState) return;
    await onUpdate(editingState.id, {
      date: editingState.date,
      category: editingState.category,
      description: editingState.description,
      amount: Number(editingState.amount) || 0,
    });
    setEditingId(null);
    setEditingState(null);
  }

  function handleEditCancel() {
    setEditingId(null);
    setEditingState(null);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t("expenses.title")}</h2>
          <p>{t("expenses.summary", { count: sorted.length, sum: fmtEUR(sum, lang) })}</p>
        </div>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field">
              <label>{t("fields.date")}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="field">
              <label>{t("fields.category")}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`expenses.categories.${c}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("fields.description")}</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("expenses.descriptionPlaceholder")}
                required
              />
            </div>
            <div className="field">
              <label>{t("fields.amount")}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("expenses.amountPlaceholder")}
                required
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            <IconPlus /> {t("expenses.submit")}
          </button>
        </form>
      </div>

      {years.length > 0 && (
        <div style={{ margin: "16px 0 10px", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t("expenses.yearFilterLabel")}</span>
          <button
            className={`btn btn-sm ${yearFilter === "all" ? "btn-primary" : ""}`}
            onClick={() => setYearFilter("all")}
          >
            {t("common.all")}
          </button>
          {years.map((y) => (
            <button
              key={y}
              className={`btn btn-sm ${yearFilter === String(y) ? "btn-primary" : ""}`}
              onClick={() => setYearFilter(String(y))}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="card empty">
          <h3>{t("expenses.emptyTitle")}</h3>
          <p>{t("expenses.emptyText")}</p>
        </div>
      ) : (
        <div className="card" style={{ padding: "8px 20px" }}>
          <table>
            <thead>
              <tr>
                <th>{t("fields.date")}</th>
                <th>{t("fields.category")}</th>
                <th>{t("fields.description")}</th>
                <th className="num">{t("fields.amount")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id}>
                  {editingId === e.id && editingState ? (
                    <>
                      <td>
                        <input
                          type="date"
                          value={editingState.date}
                          onChange={(ev) => setEditingState({ ...editingState, date: ev.target.value })}
                          style={{ width: "100%" }}
                        />
                      </td>
                      <td>
                        <select
                          value={editingState.category}
                          onChange={(ev) =>
                            setEditingState({ ...editingState, category: ev.target.value as ExpenseCategory })
                          }
                          style={{ width: "100%" }}
                        >
                          {EXPENSE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {t(`expenses.categories.${c}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={editingState.description}
                          onChange={(ev) => setEditingState({ ...editingState, description: ev.target.value })}
                          style={{ width: "100%" }}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingState.amount}
                          onChange={(ev) => setEditingState({ ...editingState, amount: ev.target.value })}
                          style={{ width: "100%", textAlign: "right" }}
                        />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-sm btn-primary" onClick={handleEditSave}>
                            {t("expenses.save")}
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={handleEditCancel}>
                            {t("expenses.cancel")}
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{fmtDate(e.date, lang)}</td>
                      <td>{t(`expenses.categories.${e.category}`, e.category)}</td>
                      <td>{e.description}</td>
                      <td className="num">{fmtEUR(e.amount, lang)}</td>
                      <td>
                        {confirmId === e.id ? (
                          <div className="row-actions">
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => {
                                onDelete(e.id);
                                setConfirmId(null);
                              }}
                            >
                              {t("expenses.confirmDelete")}
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>
                              {t("common.no")}
                            </button>
                          </div>
                        ) : (
                          <div className="row-actions">
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => handleEditStart(e)}
                              title={t("expenses.edit")}
                            >
                              {t("expenses.edit")}
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmId(e.id)}>
                              <IconTrash />
                            </button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
