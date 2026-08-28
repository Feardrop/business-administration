import { useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, fmtDate, fmtEUR, todayISO } from "../utils";
import { IconPlus, IconTrash } from "../components/Icons";

export default function Expenses({ expenses, onCreate, onDelete }) {
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [confirmId, setConfirmId] = useState(null);

  const years = useMemo(
    () => Array.from(new Set(expenses.map((e) => new Date(e.date).getFullYear()))).sort((a, b) => b - a),
    [expenses]
  );
  const filtered = yearFilter === "all" ? expenses : expenses.filter((e) => String(new Date(e.date).getFullYear()) === yearFilter);
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const sum = sorted.reduce((s, e) => s + Number(e.amount || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    await onCreate({ date, category, description, amount: Number(amount) || 0 });
    setDescription("");
    setAmount("");
  }

  return (
    <>
      <div className="page-head">
        <div><h2>Ausgaben</h2><p>{sorted.length} Position(en) · Summe {fmtEUR(sum)}</p></div>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field"><label>Datum</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
            <div className="field">
              <label>Kategorie</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Beschreibung</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="z. B. Speicherkarte" required /></div>
            <div className="field"><label>Betrag</label><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required /></div>
          </div>
          <button type="submit" className="btn btn-primary"><IconPlus /> Ausgabe erfassen</button>
        </form>
      </div>

      {years.length > 0 && (
        <div style={{ margin: "16px 0 10px", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Jahr:</span>
          <button className={`btn btn-sm ${yearFilter === "all" ? "btn-primary" : ""}`} onClick={() => setYearFilter("all")}>Alle</button>
          {years.map((y) => (
            <button key={y} className={`btn btn-sm ${yearFilter === String(y) ? "btn-primary" : ""}`} onClick={() => setYearFilter(String(y))}>{y}</button>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="card empty"><h3>Noch keine Ausgaben erfasst</h3><p>Trage Ausrüstung, Software oder Fahrtkosten oben ein.</p></div>
      ) : (
        <div className="card" style={{ padding: "8px 20px" }}>
          <table>
            <thead><tr><th>Datum</th><th>Kategorie</th><th>Beschreibung</th><th className="num">Betrag</th><th></th></tr></thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.date)}</td>
                  <td>{e.category}</td>
                  <td>{e.description}</td>
                  <td className="num">{fmtEUR(e.amount)}</td>
                  <td>
                    {confirmId === e.id ? (
                      <div className="row-actions">
                        <button className="btn btn-sm btn-danger" onClick={() => { onDelete(e.id); setConfirmId(null); }}>Löschen?</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>Nein</button>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button className="btn btn-sm btn-ghost" onClick={() => setConfirmId(e.id)}><IconTrash /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
