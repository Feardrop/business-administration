// Canonical keys, stored as-is in the DB (see expenses.categories in the i18n
// locale files for display labels) — translate the label, never the key.
export const EXPENSE_CATEGORIES = ["equipment", "software", "travel", "insurance", "rent", "training", "other"];

const LOCALE_BY_LANG = { de: "de-DE", en: "en-US" };

function localeFor(lang) {
  return LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.de;
}

export function fmtEUR(n, lang = "de") {
  const num = Number(n) || 0;
  return new Intl.NumberFormat(localeFor(lang), { style: "currency", currency: "EUR" }).format(num);
}

export function fmtDate(iso, lang = "de") {
  if (!iso) return "–";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(localeFor(lang), { day: "2-digit", month: "2-digit", year: "numeric" });
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
  const vat = inv.is_kleinunternehmer ? 0 : (net * (Number(inv.vat_rate) || 0)) / 100;
  return { net, vat, gross: net + vat };
}
