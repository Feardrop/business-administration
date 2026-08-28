import { useState } from "react";
import { fmtEUR, todayISO } from "../utils";
import { IconBack, IconPlus } from "../components/Icons";

export default function InvoiceForm({ settings, nextNumber, onCancel, onSubmit }) {
  const [date, setDate] = useState(todayISO());
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [note, setNote] = useState("");
  const [vatRate, setVatRate] = useState(19);
  const [items, setItems] = useState([{ desc: "", qty: 1, price: 0 }]);
  const [error, setError] = useState("");

  const net = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const vat = settings.kleinunternehmer ? 0 : (net * Number(vatRate)) / 100;

  function updateItem(idx, field, value) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { desc: "", qty: 1, price: 0 }]);
  }
  function removeItem(idx) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const cleanItems = items
      .map((it) => ({ description: (it.desc || "").trim(), qty: Number(it.qty) || 0, price: Number(it.price) || 0 }))
      .filter((it) => it.description !== "" || it.qty > 0 || it.price > 0);
    if (cleanItems.length === 0) {
      setError("Bitte mindestens eine Position eintragen.");
      return;
    }
    try {
      await onSubmit({
        date,
        client_name: clientName,
        client_address: clientAddress,
        vat_rate: settings.kleinunternehmer ? 0 : Number(vatRate),
        note,
        items: cleanItems,
      });
    } catch (err) {
      setError(err.message || "Fehler beim Speichern.");
    }
  }

  return (
    <>
      <div className="page-head">
        <div><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}><IconBack /> Zurück</button></div>
      </div>
      <h2 style={{ marginBottom: 16 }}>Neue Rechnung</h2>
      {error && <div className="banner banner-amber">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="field-row">
            <div className="field"><label>Rechnungsnummer</label><input type="text" className="mono" value={nextNumber} disabled /></div>
            <div className="field"><label>Rechnungsdatum</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          </div>
          <div className="field"><label>Kunde – Name / Firma</label><input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} required placeholder="z. B. Mustermann GmbH" /></div>
          <div className="field"><label>Kunde – Anschrift</label><textarea value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder={"Straße Hausnummer\nPLZ Ort"} /></div>
        </div>

        <div className="card">
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 10 }}>Positionen</label>
          {items.map((it, idx) => (
            <div className="item-row" key={idx}>
              <input type="text" placeholder="Beschreibung, z. B. Hochzeitsfotografie ganztägig" value={it.desc} onChange={(e) => updateItem(idx, "desc", e.target.value)} />
              <input type="number" min="0" step="1" placeholder="Menge" value={it.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} />
              <input type="number" min="0" step="0.01" placeholder="Preis (netto)" value={it.price} onChange={(e) => updateItem(idx, "price", e.target.value)} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(idx)} title="Zeile entfernen">✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={addItem}><IconPlus /> Position hinzufügen</button>

          {!settings.kleinunternehmer && (
            <div className="field" style={{ maxWidth: 260, marginTop: 16 }}>
              <label>Umsatzsteuersatz</label>
              <select value={vatRate} onChange={(e) => setVatRate(e.target.value)}>
                <option value="19">19 % — Auftragsarbeit</option>
                <option value="7">7 % — Bildlizenz / Nutzungsrecht</option>
                <option value="0">0 % — steuerfrei</option>
              </select>
            </div>
          )}

          <div className="item-total-line"><span className="lbl">Zwischensumme (netto)</span><span className="val">{fmtEUR(net)}</span></div>
          {!settings.kleinunternehmer && <div className="item-total-line"><span className="lbl">USt</span><span className="val">{fmtEUR(vat)}</span></div>}
          <div className="item-total-line"><span className="lbl" style={{ fontWeight: 600 }}>Gesamtbetrag</span><span className="val" style={{ fontSize: 16 }}>{fmtEUR(net + vat)}</span></div>
        </div>

        <div className="card">
          <div className="field"><label>Notiz (optional, erscheint nicht auf der Rechnung)</label><input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. interner Hinweis" /></div>
        </div>

        <div className="actions" style={{ marginTop: 6 }}>
          <button type="submit" className="btn btn-primary">Rechnung erstellen</button>
        </div>
      </form>
    </>
  );
}
