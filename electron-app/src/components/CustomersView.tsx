import React, { useEffect, useState } from "react";
import type { Customer, CustomerInput } from "../types";

interface Props {
  customers: Customer[];
  onSearch: (term: string) => Promise<void>;
  onSave: (customer: CustomerInput) => Promise<void>;
  onArchive: (customerId: number) => Promise<void>;
}

const emptyCustomer: CustomerInput = { name: "", phone: "", email: "", notes: "" };

export const CustomersView: React.FC<Props> = ({ customers, onSearch, onSave, onArchive }) => {
  const [form, setForm] = useState<CustomerInput>(emptyCustomer);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { void onSearch(search); }, 200);
    return () => window.clearTimeout(timer);
  }, [search, onSearch]);

  const save = async () => {
    setMessage(null);
    if (!form.name.trim()) {
      setMessage({ text: "Customer name is required.", type: "error" });
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      setForm(emptyCustomer);
      setMessage({ text: "Customer saved.", type: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const archive = async (customer: Customer) => {
    if (!window.confirm(`Archive ${customer.name}? Existing invoices will be preserved.`)) return;
    try {
      await onArchive(customer.id);
      if (form.id === customer.id) setForm(emptyCustomer);
      setMessage({ text: "Customer archived.", type: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), type: "error" });
    }
  };

  return (
    <div>
      {message && <div className={`notice-banner ${message.type}`}>{message.text}</div>}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{form.id ? "Edit Customer" : "Add Customer"}</h3>
          {form.id && <button className="btn btn-secondary" onClick={() => setForm(emptyCustomer)}>Cancel edit</button>}
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>Name *</label>
            <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" className="form-control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input className="form-control" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="action-row">
          <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Customer"}</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Customers ({customers.length})</h3>
          <input className="form-control" style={{ maxWidth: 280 }} placeholder="Search name, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="table-container">
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Source</th><th>Purchases</th><th>Total spent</th><th>Actions</th></tr></thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td><strong>{customer.name}</strong>{customer.email && <div className="muted">{customer.email}</div>}</td>
                  <td>{customer.phone || "—"}</td>
                  <td>{customer.source || "Walk-in"}</td>
                  <td>{customer.purchase_count}</td>
                  <td>₹{(customer.purchase_total_paise / 100).toFixed(2)}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setForm({ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, notes: customer.notes, source: customer.source })}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => void archive(customer)}>Archive</button>
                  </td>
                </tr>
              ))}
              {!customers.length && <tr><td colSpan={6} className="empty-state">No active customers found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
