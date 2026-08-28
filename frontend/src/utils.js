export const EXPENSE_CATEGORIES = [
  "Ausrüstung", "Software", "Fahrtkosten", "Versicherung",
  "Miete/Arbeitsraum", "Fortbildung", "Sonstiges",
];

export function fmtEUR(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function fmtDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function currentYear() {
  return new Date().getFullYear();
}

export function invoiceTotals(inv) {
  const net = (inv.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const vat = inv.is_kleinunternehmer ? 0 : net * (Number(inv.vat_rate) || 0) / 100;
  return { net, vat, gross: net + vat };
}
