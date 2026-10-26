import React, { useState } from "react";
import type { Product, ProductInput } from "../types";
import { formatPaise, paiseToRupees, rupeesToPaise } from "../utils/currency";

interface Props {
  products: Product[];
  onSaveProduct: (product: ProductInput) => Promise<void>;
  onAdjustStock: (productId: number, delta: number, reason: string) => Promise<void>;
  onDeleteProduct: (productId: number) => Promise<void>;
}

export const InventoryView: React.FC<Props> = ({
  products,
  onSaveProduct,
  onAdjustStock,
  onDeleteProduct,
}) => {
  const [name, setName] = useState("");
  const [priceRs, setPriceRs] = useState("");
  const [stock, setStock] = useState("");
  const [threshold, setThreshold] = useState("10");
  const [editId, setEditId] = useState<number | null>(null);

  const [searchFilter, setSearchFilter] = useState("");
  const [adjustModalProduct, setAdjustModalProduct] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState("");

  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleEdit = (p: Product) => {
    setEditId(p.id);
    setName(p.name);
    setPriceRs(paiseToRupees(p.price_paise).toString());
    setStock(p.stock.toString());
    setThreshold(p.threshold.toString());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearForm = () => {
    setEditId(null);
    setName("");
    setPriceRs("");
    setStock("");
    setThreshold("10");
  };

  const handleSave = async () => {
    setMessage(null);
    if (!name.trim()) {
      setMessage({ text: "Product name is required.", type: "error" });
      return;
    }
    const priceNum = parseFloat(priceRs);
    if (isNaN(priceNum) || priceNum < 0) {
      setMessage({ text: "Enter a valid non-negative price.", type: "error" });
      return;
    }
    const stockNum = parseInt(stock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setMessage({ text: "Enter a valid non-negative stock quantity.", type: "error" });
      return;
    }
    const threshNum = parseInt(threshold, 10);
    if (isNaN(threshNum) || threshNum < 0) {
      setMessage({ text: "Enter a valid low stock threshold.", type: "error" });
      return;
    }

    setBusy(true);
    try {
      await onSaveProduct({
        id: editId,
        name: name.trim(),
        price_paise: rupeesToPaise(priceNum),
        stock: stockNum,
        threshold: threshNum,
      });
      setMessage({
        text: editId ? `✓ Updated "${name.trim()}" successfully.` : `✓ Added "${name.trim()}" to catalog.`,
        type: "success",
      });
      handleClearForm();
    } catch (err: any) {
      setMessage({ text: `Could not save product: ${err?.message || String(err)}`, type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (p: Product) => {
    if (!window.confirm(`Are you sure you want to remove "${p.name}"? If referenced by past bills, it will be deactivated to preserve historical data.`)) {
      return;
    }

    try {
      await onDeleteProduct(p.id);
      setMessage({ text: `Product "${p.name}" removed/deactivated.`, type: "success" });
    } catch (err: any) {
      setMessage({ text: `Could not delete: ${err?.message || String(err)}`, type: "error" });
    }
  };

  const handleExecuteAdjust = async () => {
    if (!adjustModalProduct) return;
    if (adjustDelta === 0) {
      setMessage({ text: "Adjustment amount cannot be zero.", type: "error" });
      return;
    }
    if (!adjustReason.trim()) {
      setMessage({ text: "Please provide a reason for stock adjustment.", type: "error" });
      return;
    }

    try {
      await onAdjustStock(adjustModalProduct.id, adjustDelta, adjustReason.trim());
      setMessage({ text: `✓ Adjusted stock for "${adjustModalProduct.name}" by ${adjustDelta}.`, type: "success" });
      setAdjustModalProduct(null);
      setAdjustDelta(0);
      setAdjustReason("");
    } catch (err: any) {
      setMessage({ text: `Stock adjustment failed: ${err?.message || String(err)}`, type: "error" });
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div>
      {message && <div className={`notice-banner ${message.type}`}>{message.text}</div>}

      {/* Product Form Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{editId ? "Edit Product" : "Add New Product"}</h3>
          {editId && (
            <button className="btn btn-secondary btn-sm" onClick={handleClearForm}>
              Cancel Edit
            </button>
          )}
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Product Name *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Oxford Cotton Shirt"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Price (₹) *</label>
            <input
              type="number"
              min="0"
              step="1"
              className="form-control"
              placeholder="e.g. 550"
              value={priceRs}
              onChange={(e) => setPriceRs(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Opening Stock Quantity *</label>
            <input
              type="number"
              min="0"
              step="1"
              className="form-control"
              placeholder="e.g. 50"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Low Stock Alert Threshold</label>
            <input
              type="number"
              min="0"
              step="1"
              className="form-control"
              placeholder="Default: 10"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
        </div>

        <div className="action-row">
          <button className="btn btn-primary" disabled={busy} onClick={handleSave}>
            {busy ? "Saving…" : editId ? "💾 Update Product" : "💾 Save New Product"}
          </button>
          <button className="btn btn-secondary" onClick={handleClearForm}>
            Clear Form
          </button>
        </div>
      </div>

      {/* Product Inventory Table Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Inventory Catalog ({filteredProducts.length})</h3>
          <div style={{ maxWidth: "280px", width: "100%" }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search products..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Price</th>
                <th>In Stock</th>
                <th>Threshold</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "24px" }}>
                    No products found. Add products above.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const isLow = p.stock <= p.threshold;
                  return (
                    <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.6 }}>
                      <td>
                        <strong>{p.name}</strong>
                        {!p.is_active && (
                          <span style={{ marginLeft: "8px", color: "var(--danger)", fontSize: "0.75rem" }}>
                            (Inactive)
                          </span>
                        )}
                      </td>
                      <td>{formatPaise(p.price_paise)}</td>
                      <td>
                        <strong style={{ color: isLow ? "var(--warning)" : "var(--text-primary)" }}>
                          {p.stock}
                        </strong>
                      </td>
                      <td>{p.threshold}</td>
                      <td>
                        <span className={`badge ${!p.is_active ? "badge-danger" : isLow ? "badge-warning" : "badge-success"}`}>
                          {!p.is_active ? "Deactivated" : isLow ? "Low Stock" : "In Stock"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(p)}>
                            Edit
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Adjust inventory +/-"
                            onClick={() => {
                              setAdjustModalProduct(p);
                              setAdjustDelta(0);
                              setAdjustReason("");
                            }}
                          >
                            Adjust
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      {adjustModalProduct && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="card-title">Adjust Stock: {adjustModalProduct.name}</h3>
              <button className="modal-close" onClick={() => setAdjustModalProduct(null)}>
                ×
              </button>
            </div>

            <p style={{ color: "var(--text-secondary)", marginBottom: "15px" }}>
              Current stock: <strong>{adjustModalProduct.stock}</strong> units. Enter a positive number to add stock (e.g. +20) or a negative number to write off stock (e.g. -5).
            </p>

            <div className="form-group">
              <label>Stock Delta Quantity *</label>
              <input
                type="number"
                step="1"
                className="form-control"
                placeholder="e.g. 15 or -3"
                value={adjustDelta || ""}
                onChange={(e) => setAdjustDelta(parseInt(e.target.value, 10) || 0)}
              />
            </div>

            <div className="form-group">
              <label>Reason for Adjustment *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Received new shipment; Damaged in warehouse"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button className="btn btn-secondary" onClick={() => setAdjustModalProduct(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleExecuteAdjust}>
                Save Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
