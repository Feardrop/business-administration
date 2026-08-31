import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Settings } from "../types";

interface SettingsPageProps {
  settings: Settings;
  onSave: (data: Settings) => Promise<void>;
}

export default function SettingsPage({ settings, onSave }: SettingsPageProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Settings>({ ...settings });
  const [saved, setSaved] = useState(false);

  function set<K extends keyof Settings>(field: K, value: Settings[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSave({
      ...form,
      prev_year_revenue: String(Number(form.prev_year_revenue) || 0),
      invoice_prefix: (form.invoice_prefix || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    });
    setSaved(true);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t("settings.title")}</h2>
          <p>{t("settings.subtitle")}</p>
        </div>
      </div>
      {saved && <div className="banner banner-info">{t("common.saved")}</div>}
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="field-row">
            <div className="field">
              <label>{t("settings.businessNameLabel")}</label>
              <input
                type="text"
                value={form.business_name}
                onChange={(e) => set("business_name", e.target.value)}
                placeholder={t("settings.businessNamePlaceholder")}
              />
            </div>
            <div className="field">
              <label>{t("settings.ownerNameLabel")}</label>
              <input type="text" value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{t("settings.addressLabel")}</label>
            <textarea
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder={t("settings.addressPlaceholder")}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("settings.taxNumberLabel")}</label>
              <input
                type="text"
                value={form.tax_number}
                onChange={(e) => set("tax_number", e.target.value)}
                placeholder={t("settings.taxNumberPlaceholder")}
              />
            </div>
            <div className="field">
              <label>{t("settings.ibanLabel")}</label>
              <input type="text" value={form.iban} onChange={(e) => set("iban", e.target.value)} />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="ku"
              checked={!!form.kleinunternehmer}
              onChange={(e) => set("kleinunternehmer", e.target.checked)}
            />
            <label htmlFor="ku" style={{ margin: 0 }}>
              {t("settings.kleinunternehmerLabel")}
            </label>
          </div>
          <div className="field-hint" style={{ marginLeft: 24 }}>
            {t("settings.kleinunternehmerHint")}
          </div>
          <hr className="divider" />
          <div className="field-row">
            <div className="field">
              <label>{t("settings.prevYearRevenueLabel")}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.prev_year_revenue}
                onChange={(e) => set("prev_year_revenue", e.target.value)}
              />
            </div>
            <div className="field">
              <label>{t("settings.invoicePrefixLabel")}</label>
              <input
                type="text"
                value={form.invoice_prefix}
                onChange={(e) => set("invoice_prefix", e.target.value)}
                placeholder={t("settings.invoicePrefixPlaceholder")}
              />
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary">
          {t("common.save")}
        </button>
      </form>
    </>
  );
}
