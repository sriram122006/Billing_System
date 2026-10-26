import React from "react";
import type { DashboardStats } from "../types";
import { formatPaise } from "../utils/currency";
import { formatDate } from "../utils/date";

interface Props {
  stats: DashboardStats | null;
  onViewBill: (billId: number) => void;
  onNavigate: (page: string) => void;
}

export const DashboardView: React.FC<Props> = ({ stats, onViewBill, onNavigate }) => {
  if (!stats) {
    return <div className="notice-banner info">Loading dashboard statistics…</div>;
  }

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-val">{formatPaise(stats.total_revenue_paise)}</div>
          <div className="stat-lbl">Total Completed Revenue</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-val">{stats.total_bills}</div>
          <div className="stat-lbl">Total Invoices Saved</div>
        </div>
        <div className="stat-card success">
          <div className="stat-val">{formatPaise(stats.today_sales_paise)}</div>
          <div className="stat-lbl">Today's Sales Revenue</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-val">{stats.items_sold_today}</div>
          <div className="stat-lbl">Items Sold Today</div>
        </div>
      </div>

      {stats.low_stock_products.length > 0 && (
        <div className="card" style={{ borderColor: "var(--warning)" }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: "var(--warning)" }}>
              ⚠️ Low Stock Alerts ({stats.low_stock_products.length} Products)
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("inventory")}>
              Manage Inventory
            </button>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {stats.low_stock_products.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "rgba(255, 152, 0, 0.1)",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 152, 0, 0.3)",
                }}
              >
                <div>
                  <strong>{p.name}</strong>
                  <span style={{ marginLeft: "12px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    Price: {formatPaise(p.price_paise)}
                  </span>
                </div>
                <div>
                  <span className="badge badge-warning" style={{ fontSize: "0.8rem", marginRight: "10px" }}>
                    {p.stock} left (Threshold: {p.threshold})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Invoices</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("history")}>
            View All History
          </button>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill No</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Payment</th>
                <th>Grand Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_bills.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "24px" }}>
                    No bills recorded yet. Create your first bill in the New Bill section.
                  </td>
                </tr>
              ) : (
                stats.recent_bills.map((b) => (
                  <tr key={b.id}>
                    <td><strong>{b.bill_no}</strong></td>
                    <td>{formatDate(b.date)}</td>
                    <td>{b.customer_name}</td>
                    <td><span className="badge badge-success">{b.payment_method}</span></td>
                    <td style={{ fontWeight: 600, color: "var(--accent-gold)" }}>{formatPaise(b.grand_total_paise)}</td>
                    <td>
                      <span className={`badge ${b.status === "COMPLETED" ? "badge-success" : "badge-danger"}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => onViewBill(b.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
