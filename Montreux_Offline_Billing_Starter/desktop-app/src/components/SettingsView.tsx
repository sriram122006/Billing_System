import React, { useState, useEffect } from "react";
import type { ShopSettings } from "../types";

interface Props {
  settings: ShopSettings;
  onSaveSettings: (settings: ShopSettings) => Promise<void>;
  onExportBackup: () => Promise<void>;
  onImportBackup: (jsonContent: string) => Promise<void>;
}

export const SettingsView: React.FC<Props> = ({
  settings,
  onSaveSettings,
  onExportBackup,
  onImportBackup,
}) => {
  const [form, setForm] = useState<ShopSettings>(settings);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = async () => {
    setMessage(null);
    if (!form.shop_name.trim()) {
      setMessage({ text: "Shop name cannot be blank.", type: "error" });
      return;
    }
    if (form.gst_rate_percent < 0 || form.gst_rate_percent > 100) {
      setMessage({ text: "GST percentage must be between 0 and 100.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      await onSaveSettings(form);
      setMessage({ text: "✓ Shop settings updated successfully.", type: "success" });
    } catch (err: any) {
      setMessage({ text: `Could not save settings: ${err?.message || String(err)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) return;
        if (!window.confirm("⚠️ Restoring a backup will overwrite current database records. Do you wish to continue?")) {
          return;
        }
        await onImportBackup(text);
        setMessage({ text: "✓ Database backup successfully restored!", type: "success" });
      } catch (err: any) {
        setMessage({ text: `Backup restore failed: ${err?.message || String(err)}`, type: "error" });
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = "";
  };

  return (
    <div>
      {message && <div className={`notice-banner ${message.type}`}>{message.text}</div>}

      {/* Shop Details Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Shop Identity & Invoice Customization</h3>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Shop Name *</label>
            <input
              type="text"
              className="form-control"
              value={form.shop_name}
              onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Owner Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Sriram"
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Shop Contact Phone</label>
            <input
              type="tel"
              className="form-control"
              placeholder="e.g. +91 98765 43210"
              value={form.shop_phone}
              onChange={(e) => setForm({ ...form, shop_phone: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>GST Identification Number (GSTIN)</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. 29AAAAA0000A1Z5"
              value={form.shop_gst}
              onChange={(e) => setForm({ ...form, shop_gst: e.target.value })}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Complete Shop Address (Appears on Printed Receipts)</label>
          <textarea
            className="form-control"
            rows={2}
            placeholder="Street address, city, pincode"
            value={form.shop_address}
            onChange={(e) => setForm({ ...form, shop_address: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Invoice Footer Message</label>
          <input
            type="text"
            className="form-control"
            placeholder="Thank you for shopping at Montreux Clothing!"
            value={form.invoice_footer}
            onChange={(e) => setForm({ ...form, invoice_footer: e.target.value })}
          />
        </div>

        {/* Explicit Tax Configuration */}
        <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid var(--border)" }}>
          <h4 style={{ color: "var(--accent-gold)", marginBottom: "12px", fontSize: "1rem" }}>
            Tax Configuration & Compliance
          </h4>
          <div className="form-grid">
            <div className="form-group">
              <label>Applicable GST Rate (%)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                className="form-control"
                value={form.gst_rate_percent}
                onChange={(e) =>
                  setForm({ ...form, gst_rate_percent: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "8px" }}>
            <input
              type="checkbox"
              id="confirm-tax"
              checked={form.tax_confirmed}
              onChange={(e) => setForm({ ...form, tax_confirmed: e.target.checked })}
              style={{ width: "18px", height: "18px", accentColor: "var(--primary)", marginTop: "2px" }}
            />
            <label htmlFor="confirm-tax" style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
              <strong>Confirmation of Applicable Tax Rules:</strong> I confirm that {form.gst_rate_percent}% is the verified GST rate applicable to our clothing inventory category under relevant commercial and tax regulations.
            </label>
          </div>
        </div>

        <div className="action-row">
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "💾 Save Settings"}
          </button>
        </div>
      </div>

      {/* Database & Data Management Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Offline Database & Backup Protection</h3>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: "16px" }}>
          Your business data is stored locally in an embedded <strong>SQLite WAL database</strong> located in your user application data directory (outside the software installation folder). Upgrading or updating the software will never overwrite your shop database.
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={onExportBackup}>
            📤 Export Full Backup (JSON)
          </button>

          <label className="btn btn-secondary" style={{ cursor: "pointer", display: "inline-flex" }}>
            📥 Import & Restore Backup
            <input
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={handleFileImport}
            />
          </label>
        </div>
      </div>
    </div>
  );
};
