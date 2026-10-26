import React, { useState } from "react";
import type { Product, ProductInput, ProductVariant } from "../types";
import { formatPaise, paiseToRupees, rupeesToPaise } from "../utils/currency";

interface Props {
  products: Product[];
  onSaveProduct: (product: ProductInput) => Promise<void>;
  onAdjustStock: (productId: number, delta: number, reason: string) => Promise<void>;
  onDeleteProduct: (productId: number) => Promise<void>;
  onSaveVariant: (variant: Omit<ProductVariant, "id"> & { id?: number }) => Promise<void>;
  onDeleteVariant: (variantId: number) => Promise<void>;
}

export const InventoryView: React.FC<Props> = ({
  products,
  onSaveProduct,
  onAdjustStock,
  onDeleteProduct,
  onSaveVariant,
  onDeleteVariant,
}) => {
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [category, setCategory] = useState("");
  const [sizeScale, setSizeScale] = useState("None");
  const [sizeOptions, setSizeOptions] = useState("");
  const [priceRs, setPriceRs] = useState("");
  const [stock, setStock] = useState("");
  const [threshold, setThreshold] = useState("10");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [sizeStocks, setSizeStocks] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<number | null>(null);

  const [searchFilter, setSearchFilter] = useState("");
  const [adjustModalProduct, setAdjustModalProduct] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState("");

  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variantId, setVariantId] = useState<number | undefined>();
  const [variantSize, setVariantSize] = useState("");
  const [variantColor, setVariantColor] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantBarcode, setVariantBarcode] = useState("");
  const [variantPriceRs, setVariantPriceRs] = useState("");
  const [variantStock, setVariantStock] = useState("");
  const [variantStockReason, setVariantStockReason] = useState("");

  const handleEdit = (p: Product) => {
    setEditId(p.id);
    setName(p.name);
    setSize(p.size);
    setCategory(p.category);
    setSizeScale(p.size_scale);
    setSizeOptions(p.size_options);
    setPriceRs(paiseToRupees(p.price_paise).toString());
    setStock(p.stock.toString());
    setThreshold(p.threshold.toString());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearForm = () => {
    setEditId(null);
    setName("");
    setSize("");
    setCategory("");
    setSizeScale("None");
    setSizeOptions("");
    setPriceRs("");
    setStock("");
    setThreshold("10");
    setSelectedSizes([]);
    setSizeStocks({});
  };

  const availableSizes = sizeScale === "Letter"
    ? ["S", "M", "L", "XL", "XXL"]
    : sizeScale === "Waist"
      ? ["28", "30", "32", "34", "36", "38", "40"]
      : sizeScale === "Shoe"
        ? ["5", "6", "7", "8", "9", "10", "11", "12"]
        : sizeScale === "Custom"
          ? sizeOptions.split(",").map(value => value.trim()).filter(Boolean)
          : ["No size"];

  const toggleSize = (value: string) => {
    setSelectedSizes(current => current.includes(value)
      ? current.filter(sizeValue => sizeValue !== value)
      : [...current, value]);
    setSizeStocks(current => ({ ...current, [value]: current[value] ?? (stock || "0") }));
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
    const sizes = sizeScale === "None" ? ["No size"] : selectedSizes;
    if (!editId && sizes.length === 0) {
      setMessage({ text: "Select at least one size, or choose No size.", type: "error" });
      return;
    }
    const stockBySize: Record<string, number> = {};
    for (const selectedSize of sizes) {
      const quantity = Number(sizeStocks[selectedSize] ?? stockNum);
      if (!Number.isInteger(quantity) || quantity < 0) {
        setMessage({ text: `Enter valid stock for size ${selectedSize}.`, type: "error" });
        return;
      }
      stockBySize[selectedSize] = quantity;
    }

    setBusy(true);
    try {
      await onSaveProduct({
        id: editId,
        name: name.trim(),
        size: size.trim(),
        category: category.trim(),
        size_scale: sizeScale,
        size_options: sizeOptions.trim(),
        price_paise: rupeesToPaise(priceNum),
        stock: stockNum,
        threshold: threshNum,
        selected_sizes: sizes,
        size_stocks: stockBySize,
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

  const clearVariant = () => {
    setVariantId(undefined);
    setVariantSize("");
    setVariantColor("");
    setVariantSku("");
    setVariantBarcode("");
    setVariantPriceRs("");
    setVariantStock("");
    setVariantStockReason("");
  };

  const editVariant = (product: Product, variant: ProductVariant) => {
    setVariantProduct(product);
    setVariantId(variant.id);
    setVariantSize(variant.size);
    setVariantColor(variant.color);
    setVariantSku(variant.sku);
    setVariantBarcode(variant.barcode);
    setVariantPriceRs(variant.price_paise == null ? "" : paiseToRupees(variant.price_paise).toString());
    setVariantStock(String(variant.stock));
    setVariantStockReason("");
  };

  const handleSaveVariant = async () => {
    if (!variantProduct) return;
    const stock = Number(variantStock);
    const price = variantPriceRs.trim() ? rupeesToPaise(variantPriceRs) : null;
    if (!variantSize.trim() || (!variantSku.trim() && !variantBarcode.trim()) ||
        !Number.isInteger(stock) || stock < 0 || (price != null && price < 0)) {
      setMessage({ text: "Enter a unique size, SKU or barcode, and valid non-negative whole-number stock.", type: "error" });
      return;
    }
    try {
      await onSaveVariant({
        id: variantId,
        product_id: variantProduct.id,
        size: variantSize,
        color: variantColor,
        sku: variantSku,
        barcode: variantBarcode,
        price_paise: price,
        stock,
        stock_adjustment_reason: variantStockReason,
      });
      setMessage({ text: "✓ Variant saved.", type: "success" });
      clearVariant();
    } catch (err: any) {
      setMessage({ text: `Could not save variant: ${err?.message || String(err)}`, type: "error" });
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
            <label>Size</label>
            <input type="text" className="form-control" placeholder="e.g. One Size or Mixed" value={size} onChange={(e) => setSize(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Category</label>
            <input className="form-control" list="product-categories" placeholder="Shirts, Pants, Shoes..." value={category} onChange={(e) => setCategory(e.target.value)} />
            <datalist id="product-categories"><option value="Top Wear" /><option value="Bottom Wear" /><option value="Shoes" /><option value="Accessories" /><option value="Glasses" /></datalist>
          </div>
          <div className="form-group">
            <label>Size Scale</label>
            <select className="form-control" value={sizeScale} onChange={(e) => setSizeScale(e.target.value)}>
              <option value="None">No size</option><option value="Letter">S, M, L, XL</option><option value="Waist">28, 30, 32...</option><option value="Shoe">Shoe sizes</option><option value="Custom">Custom</option>
            </select>
          </div>
          {sizeScale === "Custom" && <div className="form-group">
            <label>Custom Sizes</label>
            <input className="form-control" placeholder="Comma-separated: 6, 7, 8" value={sizeOptions} onChange={(e) => setSizeOptions(e.target.value)} />
          </div>}
          {!editId && <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Choose sizes</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {availableSizes.map(option => (
                <label key={option} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "8px 10px", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                  <input type="checkbox" checked={sizeScale === "None" || selectedSizes.includes(option)} disabled={sizeScale === "None"} onChange={() => toggleSize(option)} />
                  {option}
                </label>
              ))}
            </div>
          </div>}
          {!editId && <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Stock per selected size</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {(sizeScale === "None" ? ["No size"] : selectedSizes).map(option => (
                <label key={option} style={{ minWidth: "110px" }}>{option}
                  <input type="number" min="0" step="1" className="form-control" value={sizeStocks[option] ?? stock} onChange={event => setSizeStocks(current => ({ ...current, [option]: event.target.value }))} />
                </label>
              ))}
            </div>
          </div>}
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
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                          {p.category || "Uncategorized"} · {p.size_scale === "None" ? "No size" : p.size_scale} · {p.variants.length} size variant{p.variants.length === 1 ? "" : "s"}
                        </div>
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
                          <button className="btn btn-secondary btn-sm" onClick={() => { setVariantProduct(p); clearVariant(); }}>
                            Variants
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Adjust inventory +/-"
                            disabled={p.variants.length > 0}
                            onClick={() => {
                              setAdjustModalProduct(p);
                              setAdjustDelta(0);
                              setAdjustReason("");
                            }}
                          >
                            {p.variants.length > 0 ? "Adjust variants" : "Adjust"}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>
                            Delete
                          </button>
                        </div>

                        {variantProduct && (
                          <div className="card">
                            <div className="card-header">
                              <h3 className="card-title">Variants: {variantProduct.name}</h3>
                              <button className="btn btn-secondary btn-sm" onClick={() => { setVariantProduct(null); clearVariant(); }}>Close</button>
                            </div>
                            <div className="table-container">
                              <table className="data-table">
                                <thead><tr><th>Size</th><th>Colour</th><th>SKU</th><th>Barcode</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
                                <tbody>
                                  {variantProduct.variants.map((variant) => (
                                    <tr key={variant.id}>
                                      <td>{variant.size}</td><td>{variant.color}</td><td>{variant.sku || "—"}</td><td>{variant.barcode || "—"}</td>
                                      <td>{variant.price_paise == null ? "Parent price" : formatPaise(variant.price_paise)}</td><td>{variant.stock}</td>
                                      <td>
                                        <button className="btn btn-secondary btn-sm" onClick={() => editVariant(variantProduct, variant)}>Edit</button>{" "}
                                        <button className="btn btn-danger btn-sm" onClick={async () => {
                                          try { await onDeleteVariant(variant.id); setMessage({ text: "Variant deleted.", type: "success" }); }
                                          catch (err: any) { setMessage({ text: err?.message || String(err), type: "error" }); }
                                        }}>Delete</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="form-grid">
                              <div className="form-group"><label>Size *</label><input className="form-control" value={variantSize} onChange={(e) => setVariantSize(e.target.value)} placeholder="M" /></div>
                              <div className="form-group"><label>Colour (optional)</label><input className="form-control" value={variantColor} onChange={(e) => setVariantColor(e.target.value)} placeholder="Optional" /></div>
                              <div className="form-group"><label>SKU</label><input className="form-control" value={variantSku} onChange={(e) => setVariantSku(e.target.value)} /></div>
                              <div className="form-group"><label>Barcode</label><input className="form-control" value={variantBarcode} onChange={(e) => setVariantBarcode(e.target.value)} /></div>
                              <div className="form-group"><label>Variant Price (₹)</label><input type="number" min="0" step="0.01" className="form-control" value={variantPriceRs} onChange={(e) => setVariantPriceRs(e.target.value)} placeholder="Parent price" /></div>
                              <div className="form-group"><label>Stock *</label><input type="number" min="0" step="1" className="form-control" value={variantStock} onChange={(e) => setVariantStock(e.target.value)} /></div>
                              {variantId && <div className="form-group"><label>Stock change reason *</label><input className="form-control" value={variantStockReason} onChange={(e) => setVariantStockReason(e.target.value)} placeholder="e.g. cycle count" /></div>}
                            </div>
                            <div className="action-row">
                              <button className="btn btn-primary" onClick={handleSaveVariant}>{variantId ? "Update Variant" : "Add Variant"}</button>
                              <button className="btn btn-secondary" onClick={clearVariant}>Clear</button>
                            </div>
                          </div>
                        )}
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
