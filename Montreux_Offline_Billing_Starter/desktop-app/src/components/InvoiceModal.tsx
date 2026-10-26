import React from "react";
import type { ShopSettings } from "../types";
import { formatPaise } from "../utils/currency";
import { formatDate } from "../utils/date";

interface Props {
  invoiceData: {
    bill_no: string;
    date: string;
    customer_name: string;
    customer_phone?: string;
    payment_method: string;
    items: Array<{
      product_name_snapshot: string;
      size: string;
      price_paise: number;
      quantity: number;
      total_paise: number;
    }>;
    subtotal_paise: number;
    total_discount_paise: number;
    gst_amount_paise: number;
    grand_total_paise: number;
  } | null;
  settings: ShopSettings;
  onClose: () => void;
}

export const InvoiceModal: React.FC<Props> = ({ invoiceData, settings, onClose }) => {
  if (!invoiceData) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="card-title">Invoice {invoiceData.bill_no}</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Printable Sheet */}
        <div className="invoice-sheet" id="invoice-sheet">
          <div className="invoice-sheet-header">
            <div
              style={{
                width: "55px",
                height: "55px",
                margin: "0 auto 10px",
                borderRadius: "50%",
                background: "#8b2942",
                color: "#d4af37",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: "1.4rem",
              }}
            >
              M
            </div>
            <div className="invoice-sheet-title">{settings.shop_name.toUpperCase()}</div>
            <div className="invoice-sheet-tagline">PREMIUM FASHION</div>
            {settings.shop_address && (
              <div style={{ color: "#666", fontSize: "0.85rem", marginTop: "6px" }}>
                {settings.shop_address}
              </div>
            )}
            <div style={{ color: "#666", fontSize: "0.85rem" }}>
              {settings.shop_phone && <span>Phone: {settings.shop_phone} </span>}
              {settings.shop_gst && <span> | GSTIN: {settings.shop_gst}</span>}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
              marginBottom: "20px",
              fontSize: "0.88rem",
            }}
          >
            <div>
              <p><strong>Bill No:</strong> {invoiceData.bill_no}</p>
              <p><strong>Date:</strong> {formatDate(invoiceData.date)}</p>
              <p><strong>Payment:</strong> {invoiceData.payment_method}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p><strong>Customer:</strong> {invoiceData.customer_name}</p>
              <p><strong>Phone:</strong> {invoiceData.customer_phone || "-"}</p>
            </div>
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginBottom: "20px",
              fontSize: "0.88rem",
            }}
          >
            <thead>
              <tr style={{ background: "#8b2942", color: "#fff" }}>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>#</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Item</th>
                <th style={{ padding: "8px 10px", textAlign: "center" }}>Size</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Price</th>
                <th style={{ padding: "8px 10px", textAlign: "center" }}>Qty</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.items.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #e0e0e0" }}>
                  <td style={{ padding: "8px 10px" }}>{idx + 1}</td>
                  <td style={{ padding: "8px 10px" }}><strong>{item.product_name_snapshot}</strong></td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>{item.size}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{formatPaise(item.price_paise)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>{item.quantity}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{formatPaise(item.total_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ textAlign: "right", fontSize: "0.9rem", marginTop: "15px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "40px", padding: "4px 0" }}>
              <span>Subtotal:</span>
              <span style={{ minWidth: "90px" }}>{formatPaise(invoiceData.subtotal_paise)}</span>
            </div>
            {invoiceData.total_discount_paise > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "40px", padding: "4px 0", color: "#2e7d32" }}>
                <span>Discount:</span>
                <span style={{ minWidth: "90px" }}>- {formatPaise(invoiceData.total_discount_paise)}</span>
              </div>
            )}
            {invoiceData.gst_amount_paise > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "40px", padding: "4px 0" }}>
                <span>GST:</span>
                <span style={{ minWidth: "90px" }}>+ {formatPaise(invoiceData.gst_amount_paise)}</span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "40px",
                padding: "10px 0 0",
                marginTop: "6px",
                borderTop: "2px solid #8b2942",
                fontWeight: 800,
                fontSize: "1.2rem",
                color: "#8b2942",
              }}
            >
              <span>Grand Total:</span>
              <span style={{ minWidth: "90px" }}>{formatPaise(invoiceData.grand_total_paise)}</span>
            </div>
          </div>

          <div
            style={{
              textAlign: "center",
              marginTop: "24px",
              paddingTop: "14px",
              borderTop: "1px dashed #ccc",
              color: "#777",
              fontSize: "0.85rem",
            }}
          >
            {settings.invoice_footer || "Thank you for shopping at Montreux Clothing!"}
          </div>
        </div>

        {/* Modal Controls */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={handlePrint}>
            🖨️ Print Invoice
          </button>
        </div>
      </div>
    </div>
  );
};
