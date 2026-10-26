import React, { useState } from "react";
import type { BillSummary, BillFilter } from "../types";
import { formatPaise } from "../utils/currency";
import { formatDate } from "../utils/date";

interface Props {
  bills: BillSummary[];
  onFilterBills: (filter: BillFilter) => void;
  onViewBill: (billId: number) => void;
  onCancelBill: (billId: number, reason: string) => Promise<void>;
  onExportCsv: (filter: BillFilter) => Promise<void>;
}

export const HistoryView: React.FC<Props> = ({
  bills,
  onFilterBills,
  onViewBill,
  onCancelBill,
  onExportCsv,
}) => {
  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchBillNo, setSearchBillNo] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedBillForCancel, setSelectedBillForCancel] = useState<BillSummary | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const handleSearch = () => {
    onFilterBills({
      search_customer: searchCustomer.trim() || undefined,
      search_bill_no: searchBillNo.trim() || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      status: statusFilter !== "ALL" ? statusFilter : undefined,
    });
  };

  const handleClearFilters = () => {
    setSearchCustomer("");
    setSearchBillNo("");
    setDateFrom("");
    setDateTo("");
    setStatusFilter("ALL");
    onFilterBills({});
  };

  const handleExecuteCancel = async () => {
    if (!selectedBillForCancel) return;
    if (!cancelReason.trim()) {
      setCancelError("A cancellation reason is required for financial auditing.");
      return;
    }

    setIsCancelling(true);
    setCancelError("");
    try {
      await onCancelBill(selectedBillForCancel.id, cancelReason.trim());
      setSelectedBillForCancel(null);
      setCancelReason("");
    } catch (err: any) {
      setCancelError(err?.message || String(err));
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div>
      {/* Search and Filters Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Filter Invoices</h3>
          <button
            className="btn btn-success btn-sm"
            onClick={() =>
              onExportCsv({
            search_bill_no: searchBillNo || undefined,
            search_customer: searchCustomer || undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
                status: statusFilter !== "ALL" ? statusFilter : undefined,
              })
            }
          >
            📥 Export CSV
          </button>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Invoice Number</label>
            <input type="text" className="form-control" placeholder="e.g. MC1001" value={searchBillNo} onChange={(e) => setSearchBillNo(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Customer Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="Search customer..."
              value={searchCustomer}
              onChange={(e) => setSearchCustomer(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>From Date</label>
            <input
              type="date"
              className="form-control"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>To Date</label>
            <input
              type="date"
              className="form-control"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <button className="btn btn-primary" onClick={handleSearch}>
            🔍 Search
          </button>
          <button className="btn btn-secondary" onClick={handleClearFilters}>
            Clear Filters
          </button>
        </div>
      </div>

      {/* Bill History Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Invoice Records ({bills.length})</h3>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill No</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Items</th>
                <th>Grand Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "30px" }}>
                    No invoices match your filter criteria.
                  </td>
                </tr>
              ) : (
                bills.map((b) => (
                  <tr key={b.id}>
                    <td><strong>{b.bill_no}</strong></td>
                    <td>{formatDate(b.date)}</td>
                    <td>{b.customer_name}</td>
                    <td>{b.customer_phone || "-"}</td>
                    <td>{b.items_count}</td>
                    <td style={{ fontWeight: 600, color: "var(--accent-gold)" }}>{formatPaise(b.grand_total_paise)}</td>
                    <td><span className="badge badge-success">{b.payment_method}</span></td>
                    <td>
                      <span className={`badge ${b.status === "COMPLETED" ? "badge-success" : "badge-danger"}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button className="btn btn-primary btn-sm" onClick={() => onViewBill(b.id)}>
                          View
                        </button>
                        {b.status === "COMPLETED" && (
                          <button
                            className="btn btn-danger btn-sm"
                            title="Cancel bill and return items to stock"
                            onClick={() => {
                              setSelectedBillForCancel(b);
                              setCancelReason("");
                              setCancelError("");
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancellation Modal Dialog */}
      {selectedBillForCancel && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="card-title" style={{ color: "var(--danger)" }}>
                Cancel Invoice {selectedBillForCancel.bill_no}
              </h3>
              <button className="modal-close" onClick={() => setSelectedBillForCancel(null)}>
                ×
              </button>
            </div>

            {cancelError && <div className="notice-banner error">{cancelError}</div>}

            <p style={{ color: "var(--text-secondary)", marginBottom: "15px", lineHeight: 1.5 }}>
              ⚠️ Cancelling this bill will return all line items back to inventory stock and mark this invoice as
              <strong> CANCELLED</strong> in the database. Financial audit rules prohibit permanently deleting saved bills.
            </p>

            <div className="form-group">
              <label>Reason for Cancellation / Return *</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="e.g. Customer returned unworn shirt with tag; order entered in error"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button
                className="btn btn-secondary"
                disabled={isCancelling}
                onClick={() => setSelectedBillForCancel(null)}
              >
                Keep Invoice
              </button>
              <button
                className="btn btn-danger"
                disabled={isCancelling}
                onClick={handleExecuteCancel}
              >
                {isCancelling ? "Processing Restock…" : "Confirm Cancellation & Restock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
