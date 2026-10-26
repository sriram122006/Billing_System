import React, { useState } from "react";
import type { BillDetail, BillSummary, ReturnRequest, ReturnSummary } from "../types";

interface Props {
  bills: BillSummary[];
  returns: ReturnSummary[];
  onGetDetail: (billId: number) => Promise<BillDetail>;
  onCreate: (request: ReturnRequest) => Promise<void>;
}

export const ReturnsView: React.FC<Props> = ({ bills, returns, onGetDetail, onCreate }) => {
  const [billId, setBillId] = useState<number | "">("");
  const [detail, setDetail] = useState<BillDetail | null>(null);
  const [itemId, setItemId] = useState<number | "">("");
  const [quantity, setQuantity] = useState(1);
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<ReturnRequest["refund_method"]>("Cash");
  const [message, setMessage] = useState("");
  const load = async (id: number) => { setBillId(id); setDetail(await onGetDetail(id)); };
  const submit = async () => {
    try {
      if (!billId || !itemId || !reason.trim()) throw new Error("Invoice, item and reason are required.");
      await onCreate({ bill_id: Number(billId), reason, refund_method: method, items: [{ bill_item_id: Number(itemId), quantity, restock }] });
      setMessage("Return recorded and original invoice preserved."); setDetail(null); setBillId(""); setItemId(""); setReason("");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  return <div>
    {message && <div className="notice-banner info">{message}</div>}
    <div className="card"><div className="card-header"><h3 className="card-title">Return / Refund</h3></div>
      <div className="form-grid">
        <div className="form-group"><label>Original invoice</label><select className="form-control" value={billId} onChange={e => { const id = Number(e.target.value); if (id) void load(id); }}><option value="">Select completed invoice</option>{bills.filter(b => b.status === "COMPLETED" || b.status === "REFUNDED").map(b => <option key={b.id} value={b.id}>{b.bill_no} · {b.customer_name}</option>)}</select></div>
        <div className="form-group"><label>Item</label><select className="form-control" value={itemId} onChange={e => setItemId(e.target.value ? Number(e.target.value) : "")}><option value="">Select item</option>{detail?.items.map(item => <option key={item.id} value={item.id}>{item.product_name_snapshot} · {item.size} · sold {item.quantity}</option>)}</select></div>
        <div className="form-group"><label>Quantity</label><input className="form-control" type="number" min="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></div>
        <div className="form-group"><label>Refund method</label><select className="form-control" value={method} onChange={e => setMethod(e.target.value as ReturnRequest["refund_method"])}><option>Cash</option><option>UPI</option><option>Card</option><option>Pending</option></select></div>
        <div className="form-group"><label>Reason *</label><input className="form-control" value={reason} onChange={e => setReason(e.target.value)} /></div>
      </div>
      <label><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} /> Returned item is eligible for resale</label>
      <div className="action-row"><button className="btn btn-primary" onClick={() => void submit()}>Record Return</button></div>
    </div>
    <div className="card"><div className="card-header"><h3 className="card-title">Return History</h3></div><div className="table-container"><table><thead><tr><th>Invoice</th><th>Reason</th><th>Method</th><th>Refund</th><th>Date</th></tr></thead><tbody>{returns.map(item => <tr key={item.id}><td>{item.bill_no}</td><td>{item.reason}</td><td>{item.refund_method}</td><td>₹{(item.total_paise / 100).toFixed(2)}</td><td>{item.created_at}</td></tr>)}</tbody></table></div></div>
  </div>;
};
