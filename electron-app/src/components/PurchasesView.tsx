import React, { useEffect, useState } from "react";
import type { Product, PurchaseRequest, PurchaseSummary, StockMovement, Supplier, SupplierInput } from "../types";

interface Props {
  products: Product[];
  suppliers: Supplier[];
  purchases: PurchaseSummary[];
  movements: StockMovement[];
  onSaveSupplier: (supplier: SupplierInput) => Promise<void>;
  onReceive: (purchase: PurchaseRequest) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const blankSupplier: SupplierInput = { name: "", phone: "", email: "", address: "" };

export const PurchasesView: React.FC<Props> = ({ products, suppliers, purchases, movements, onSaveSupplier, onReceive, onRefresh }) => {
  const [supplier, setSupplier] = useState<SupplierInput>(blankSupplier);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [receiptNo, setReceiptNo] = useState("");
  const [variantId, setVariantId] = useState<number | "">("");
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState("0");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { void onRefresh(); }, [onRefresh]);
  const variants = products.flatMap(product => product.variants.map(variant => ({ ...variant, productName: product.name })));

  const save = async () => {
    try { await onSaveSupplier(supplier); setSupplier(blankSupplier); setMessage("Supplier saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const receive = async () => {
    try {
      if (!supplierId || !variantId || !receiptNo.trim()) throw new Error("Receipt, supplier and variant are required.");
      await onReceive({
        receipt_no: receiptNo.trim(), supplier_id: Number(supplierId), received_at: new Date().toISOString().slice(0, 10),
        notes, items: [{ variant_id: Number(variantId), quantity, unit_cost_paise: Math.round(Number(unitCost) * 100) }],
      });
      setReceiptNo(""); setQuantity(1); setMessage("Purchase received and stock updated atomically.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  return <div>
    {message && <div className="notice-banner info">{message}</div>}
    <div className="card">
      <div className="card-header"><h3 className="card-title">Suppliers</h3></div>
      <div className="form-grid">
        {(["name", "phone", "email", "address"] as const).map(field => <div className="form-group" key={field}>
          <label>{field[0].toUpperCase() + field.slice(1)}{field === "name" ? " *" : ""}</label>
          <input className="form-control" value={supplier[field]} onChange={e => setSupplier({ ...supplier, [field]: e.target.value })} />
        </div>)}
      </div>
      <button className="btn btn-primary" onClick={() => void save()}>Save Supplier</button>
      <div className="form-group" style={{ marginTop: 16 }}><label>Supplier for receipt</label>
        <select className="form-control" value={supplierId} onChange={e => setSupplierId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Select supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    </div>
    <div className="card">
      <div className="card-header"><h3 className="card-title">Receive Purchase</h3></div>
      <div className="form-grid">
        <div className="form-group"><label>Receipt number *</label><input className="form-control" value={receiptNo} onChange={e => setReceiptNo(e.target.value)} /></div>
        <div className="form-group"><label>Variant *</label><select className="form-control" value={variantId} onChange={e => setVariantId(e.target.value ? Number(e.target.value) : "")}><option value="">Select variant</option>{variants.map(v => <option key={v.id} value={v.id}>{v.productName} · {v.size} / {v.color}</option>)}</select></div>
        <div className="form-group"><label>Quantity *</label><input type="number" min="1" className="form-control" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></div>
        <div className="form-group"><label>Unit cost (₹)</label><input type="number" min="0" step="0.01" className="form-control" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
        <div className="form-group"><label>Notes</label><input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
      <button className="btn btn-primary" onClick={() => void receive()}>Receive & Update Stock</button>
    </div>
    <div className="card"><div className="card-header"><h3 className="card-title">Purchase History</h3></div><div className="table-container"><table><thead><tr><th>Receipt</th><th>Supplier</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>{purchases.map(p => <tr key={p.id}><td>{p.receipt_no}</td><td>{p.supplier_name}</td><td>{p.received_at}</td><td>₹{(p.total_paise / 100).toFixed(2)}</td><td>{p.status}</td></tr>)}</tbody></table></div></div>
    <div className="card"><div className="card-header"><h3 className="card-title">Stock Movement History</h3></div><div className="table-container"><table><thead><tr><th>Time</th><th>Product / Variant</th><th>Type</th><th>Quantity</th><th>Reason</th></tr></thead><tbody>{movements.map(m => <tr key={m.id}><td>{m.created_at}</td><td>{m.product_name} {m.variant_label}</td><td>{m.movement_type}</td><td>{m.quantity}</td><td>{m.reason || "—"}</td></tr>)}</tbody></table></div></div>
  </div>;
};
