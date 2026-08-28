import { useState } from "react";

export default function SettingsPage({ settings, onSave }) {
  const [form, setForm] = useState({ ...settings });
  const [saved, setSaved] = useState(false);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await onSave({
      ...form,
      prev_year_revenue: Number(form.prev_year_revenue) || 0,
      invoice_prefix: (form.invoice_prefix || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    });
    setSaved(true);
  }

  return (
    <>
      <div className="page-head"><div><h2>Einstellungen</h2><p>Diese Angaben erscheinen auf jeder Rechnung.</p></div></div>
      {saved && <div className="banner banner-info">Gespeichert.</div>}
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="field-row">
            <div className="field"><label>Geschäfts- / Künstlername</label><input type="text" value={form.business_name} onChange={(e) => set("business_name", e.target.value)} placeholder="z. B. Norman Fotografie" /></div>
            <div className="field"><label>Name (Inhaber)</label><input type="text" value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} /></div>
          </div>
          <div className="field"><label>Anschrift</label><textarea value={form.address} onChange={(e) => set("address", e.target.value)} placeholder={"Straße Hausnummer\nPLZ Dresden"} /></div>
          <div className="field-row">
            <div className="field"><label>Steuernummer</label><input type="text" value={form.tax_number} onChange={(e) => set("tax_number", e.target.value)} placeholder="vom Finanzamt, nach Anmeldung" /></div>
            <div className="field"><label>IBAN (optional, für Rechnungen)</label><input type="text" value={form.iban} onChange={(e) => set("iban", e.target.value)} /></div>
          </div>
        </div>
        <div className="card">
          <div className="checkbox-row">
            <input type="checkbox" id="ku" checked={!!form.kleinunternehmer} onChange={(e) => set("kleinunternehmer", e.target.checked)} />
            <label htmlFor="ku" style={{ margin: 0 }}>Kleinunternehmerregelung (§19 UStG) nutzen</label>
          </div>
          <div className="field-hint" style={{ marginLeft: 24 }}>Wenn aktiv, weisen deine Rechnungen keine Umsatzsteuer aus.</div>
          <hr className="divider" />
          <div className="field-row">
            <div className="field"><label>Vorjahresumsatz (für die 25.000-€-Grenze)</label><input type="number" min="0" step="0.01" value={form.prev_year_revenue} onChange={(e) => set("prev_year_revenue", e.target.value)} /></div>
            <div className="field"><label>Präfix für Rechnungsnummern (optional)</label><input type="text" value={form.invoice_prefix} onChange={(e) => set("invoice_prefix", e.target.value)} placeholder="z. B. FOTO" /></div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary">Speichern</button>
      </form>
    </>
  );
}
