import React, { useState, useMemo } from "react";
import type { Product, CartItem, SaleRequest, SaleResponse, Customer } from "../types";
import { formatPaise, rupeesToPaise } from "../utils/currency";
import { getTodayDateString } from "../utils/date";

interface Props {
  products: Product[];
  customers: Customer[];
  gstRate: number;
  onSaveSale: (sale: SaleRequest) => Promise<SaleResponse>;
  onPrintPreview: (saleData: any) => void;
  onRefreshProducts: () => void;
}

export const BillingView: React.FC<Props> = ({
  products,
  customers,
  gstRate,
  onSaveSale,
  onPrintPreview,
  onRefreshProducts,
}) => {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [saveCustomer, setSaveCustomer] = useState(true);
  const [customerSource, setCustomerSource] = useState("Walk-in");
  const [billDate, setBillDate] = useState(getTodayDateString());
  const [paymentMethod, setPaymentMethod] = useState<SaleRequest["payment_method"]>("Cash");

  const [cartItems, setCartItems] = useState<CartItem[]>([
    { row_id: "row_1", product_id: "", variant_id: "", size: "", quantity: 1 },
  ]);

  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountFlatRs, setDiscountFlatRs] = useState<string>("0");
  const [applyGst, setApplyGst] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Product lookup helper
  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);

  // Add Item Row
  const handleAddItem = () => {
    setCartItems((prev) => [
      ...prev,
      { row_id: `row_${Date.now()}_${Math.random()}`, product_id: "", variant_id: "", size: "", quantity: 1 },
    ]);
  };

  // Remove Item Row
  const handleRemoveItem = (rowId: string) => {
    if (cartItems.length <= 1) {
      setErrorMessage("At least one line item is required.");
      return;
    }
    setCartItems((prev) => prev.filter((item) => item.row_id !== rowId));
  };

  // Update Item Row
  const handleUpdateItem = (rowId: string, updates: Partial<CartItem>) => {
    setErrorMessage("");
    setCartItems((prev) =>
      prev.map((item) => (item.row_id === rowId ? { ...item, ...updates } : item))
    );
  };

  // Calculate live totals
  const { subtotalPaise, totalDiscountPaise, gstAmountPaise, grandTotalPaise, lineTotals } = useMemo(() => {
    let subtotal = 0;
    const lines: Record<string, { unitPricePaise: number; lineTotalPaise: number; stock: number }> = {};

    for (const item of cartItems) {
      if (item.product_id) {
        const prod = activeProducts.find((p) => p.id === Number(item.product_id));
        const variant = prod?.variants.find((entry) => entry.id === Number(item.variant_id));
        if (prod && variant) {
          const qty = Math.max(1, item.quantity);
          const lineTotal = (variant.price_paise ?? prod.price_paise) * qty;
          subtotal += lineTotal;
          lines[item.row_id] = { unitPricePaise: variant.price_paise ?? prod.price_paise, lineTotalPaise: lineTotal, stock: variant.stock };
        }
      }
    }

    const flatPaise = rupeesToPaise(discountFlatRs);
    const pctPaise = Math.round(subtotal * (Math.min(100, Math.max(0, discountPercent)) / 100));
    const totalDiscount = Math.min(subtotal, pctPaise + flatPaise);
    const afterDiscount = subtotal - totalDiscount;
    const gstPaise = applyGst ? Math.round(afterDiscount * (gstRate / 100)) : 0;
    const grandTotal = afterDiscount + gstPaise;

    return {
      subtotalPaise: subtotal,
      totalDiscountPaise: totalDiscount,
      gstAmountPaise: gstPaise,
      grandTotalPaise: grandTotal,
      lineTotals: lines,
    };
  }, [cartItems, activeProducts, discountPercent, discountFlatRs, applyGst, gstRate]);

  // Save Sale Transaction
  const handleSaveBill = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (!customerName.trim()) {
      setErrorMessage("Please enter customer name.");
      return;
    }

    const validItems = cartItems.filter((it) => it.product_id !== "" && it.variant_id !== "");
    if (validItems.length === 0) {
      setErrorMessage("Please select at least one product.");
      return;
    }

    // Check individual and aggregate stock
    const requestedStock = new Map<number, { name: string; requested: number; available: number }>();
    for (const item of validItems) {
      const prod = activeProducts.find((p) => p.id === Number(item.product_id));
      if (!prod) continue;
      const cur = requestedStock.get(prod.id) || { name: prod.name, requested: 0, available: prod.stock };
      cur.requested += item.quantity;
      requestedStock.set(prod.id, cur);
    }

    for (const [, info] of requestedStock) {
      if (info.requested > info.available) {
        setErrorMessage(
          `Insufficient stock for "${info.name}": requested ${info.requested}, but only ${info.available} available.`
        );
        return;
      }
    }

    const saleRequest: SaleRequest = {
      date: billDate,
      idempotency_key: idempotencyKey,
      customer_id: customerId,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      save_customer: saveCustomer,
      customer_source: customerSource.trim(),
      payment_method: paymentMethod,
      items: validItems.map((it) => ({
        product_id: Number(it.product_id),
        variant_id: Number(it.variant_id),
        size: it.size,
        quantity: it.quantity,
      })),
      discount_percent: Number(discountPercent) || 0,
      discount_flat_paise: rupeesToPaise(discountFlatRs),
      apply_gst: applyGst,
    };

    setIsSubmitting(true);
    try {
      const res = await onSaveSale(saleRequest);
      setSuccessMessage(
        `✓ Invoice ${res.bill_no} saved successfully! Amount: ${formatPaise(res.total_paise)}. Stock deducted inside atomic transaction.`
      );
      handleClearForm();
      onRefreshProducts();
    } catch (err: any) {
      setErrorMessage(`Sale Failed: ${err?.message || String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerId(null);
    setSaveCustomer(true);
    setCustomerSource("Walk-in");
    setBillDate(getTodayDateString());
    setPaymentMethod("Cash");
    setCartItems([{ row_id: `row_${Date.now()}`, product_id: "", variant_id: "", size: "", quantity: 1 }]);
    setDiscountPercent(0);
    setDiscountFlatRs("0");
    setApplyGst(false);
    setIdempotencyKey(crypto.randomUUID());
  };

  const handleTriggerPrint = () => {
    if (!customerName.trim()) {
      setErrorMessage("Please enter customer name before printing.");
      return;
    }
    const validItems = cartItems.filter((it) => it.product_id !== "" && it.variant_id !== "");
    if (validItems.length === 0) {
      setErrorMessage("Add at least one product before printing invoice.");
      return;
    }

    const previewData = {
      bill_no: "PREVIEW",
      date: billDate,
      customer_name: customerName,
      customer_phone: customerPhone,
      payment_method: paymentMethod,
      items: validItems.map((it) => {
        const prod = activeProducts.find((p) => p.id === Number(it.product_id));
        const variant = prod?.variants.find((entry) => entry.id === Number(it.variant_id));
        return {
          product_name_snapshot: prod ? prod.name : "Product",
          size: it.size,
          quantity: it.quantity,
          price_paise: variant?.price_paise ?? prod?.price_paise ?? 0,
          total_paise: (variant?.price_paise ?? prod?.price_paise ?? 0) * it.quantity,
        };
      }),
      subtotal_paise: subtotalPaise,
      total_discount_paise: totalDiscountPaise,
      gst_amount_paise: gstAmountPaise,
      grand_total_paise: grandTotalPaise,
    };
    onPrintPreview(previewData);
  };

  return (
    <div>
      {errorMessage && <div className="notice-banner error">⚠️ {errorMessage}</div>}
      {successMessage && <div className="notice-banner success">{successMessage}</div>}

      {/* Customer Info Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Customer & Payment Details</h3>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>Saved Customer (optional)</label>
            <select
              className="form-control"
              value={customerId ?? ""}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                const customer = customers.find((entry) => entry.id === id);
                setCustomerId(id);
                if (customer) {
                  setCustomerName(customer.name);
                  setCustomerPhone(customer.phone);
                }
              }}
            >
              <option value="">Walk-in / enter manually</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Customer Name *</label>
            <input
              type="text"
              className="form-control"
              placeholder="Enter full name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Phone Number</label>
            <input
              type="tel"
              className="form-control"
              placeholder="e.g. 9876543210"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Customer source</label>
            <input
              className="form-control"
              list="customer-sources"
              value={customerSource}
              onChange={(e) => setCustomerSource(e.target.value)}
              placeholder="Walk-in, Instagram, Friend..."
            />
            <datalist id="customer-sources">
              <option value="Walk-in" />
              <option value="Instagram" />
              <option value="Friend / Referral" />
              <option value="WhatsApp" />
              <option value="Facebook" />
              <option value="Website" />
              <option value="Existing customer" />
            </datalist>
          </div>
          {!customerId && <div className="form-group" style={{ alignSelf: "end" }}>
            <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="checkbox" checked={saveCustomer} onChange={(e) => setSaveCustomer(e.target.checked)} />
              Add this customer to the customer list
            </label>
          </div>}
          <div className="form-group">
            <label>Invoice Date</label>
            <input
              type="date"
              className="form-control"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Payment Method</label>
            <select
              className="form-control"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
        </div>
      </div>

      {/* Multi-Item Line Items Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Bill Items (Multi-Item Cart)</h3>
          <button className="btn btn-primary btn-sm" onClick={handleAddItem}>
            + Add Item
          </button>
        </div>

        <div className="table-container">
          <table className="cart-table">
            <thead>
              <tr>
                <th style={{ width: "35%" }}>Product</th>
                <th style={{ width: "20%" }}>Variant</th>
                <th style={{ width: "15%" }}>Price</th>
                <th style={{ width: "15%" }}>Quantity</th>
                <th style={{ width: "15%" }}>Total</th>
                <th style={{ width: "5%" }}></th>
              </tr>
            </thead>
            <tbody>
              {cartItems.map((item) => {
                const lineInfo = lineTotals[item.row_id];
                const isOutOfStock = lineInfo && item.quantity > lineInfo.stock;

                return (
                  <tr key={item.row_id}>
                    <td>
                      <select
                        className="form-control"
                        value={item.product_id}
                        onChange={(e) =>
                          handleUpdateItem(item.row_id, {
                            product_id: e.target.value ? Number(e.target.value) : "",
                            variant_id: "",
                            size: "",
                          })
                        }
                      >
                        <option value="">-- Select Product --</option>
                        {activeProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} - {p.variants.reduce((sum, v) => sum + v.stock, 0)} in stock
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="form-control"
                        value={item.variant_id}
                        disabled={!item.product_id}
                        onChange={(e) => {
                          const variant = activeProducts.find((p) => p.id === Number(item.product_id))?.variants.find((v) => v.id === Number(e.target.value));
                          handleUpdateItem(item.row_id, { variant_id: e.target.value ? Number(e.target.value) : "", size: variant?.size ?? "" });
                        }}
                      >
                        <option value="">-- Select Size / Colour --</option>
                        {activeProducts.find((p) => p.id === Number(item.product_id))?.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.size} / {variant.color} · {variant.sku || variant.barcode} · {variant.stock} in stock
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control"
                        readOnly
                        value={lineInfo ? formatPaise(lineInfo.unitPricePaise) : "₹0.00"}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        className="form-control"
                        style={isOutOfStock ? { borderColor: "var(--danger)" } : {}}
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateItem(item.row_id, {
                            quantity: Math.max(1, parseInt(e.target.value) || 1),
                          })
                        }
                      />
                      {isOutOfStock && (
                        <div style={{ color: "var(--danger)", fontSize: "0.75rem", marginTop: "3px" }}>
                          Exceeds stock ({lineInfo.stock})
                        </div>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control"
                        readOnly
                        value={lineInfo ? formatPaise(lineInfo.lineTotalPaise) : "₹0.00"}
                      />
                    </td>
                    <td>
                      <button
                        className="btn-remove"
                        title="Remove row"
                        onClick={() => handleRemoveItem(item.row_id)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button className="btn btn-secondary" onClick={handleAddItem} style={{ width: "100%", marginTop: "10px" }}>
          + Add Another Product
        </button>
      </div>

      {/* Bill Summary & Action Controls */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Bill Calculation & Discounts</h3>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Discount (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              className="form-control"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label>Flat Discount (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              className="form-control"
              value={discountFlatRs}
              onChange={(e) => setDiscountFlatRs(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Apply GST ({gstRate}%)</label>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
              <input
                type="checkbox"
                id="apply-gst-check"
                checked={applyGst}
                onChange={(e) => setApplyGst(e.target.checked)}
                style={{ width: "20px", height: "20px", accentColor: "var(--primary)" }}
              />
              <label htmlFor="apply-gst-check" style={{ cursor: "pointer", color: "var(--text-primary)" }}>
                {applyGst ? `Yes (Add ${gstRate}% Tax)` : "No GST"}
              </label>
            </div>
          </div>
        </div>

        <div className="pos-summary">
          <div className="summary-row">
            <span>Subtotal ({cartItems.filter((i) => i.product_id).length} Items)</span>
            <span>{formatPaise(subtotalPaise)}</span>
          </div>
          <div className="summary-row">
            <span>Total Discount</span>
            <span style={{ color: "var(--success)" }}>- {formatPaise(totalDiscountPaise)}</span>
          </div>
          {applyGst && (
            <div className="summary-row">
              <span>GST ({gstRate}%)</span>
              <span>+ {formatPaise(gstAmountPaise)}</span>
            </div>
          )}
          <div className="summary-row total">
            <span>Grand Total</span>
            <span>{formatPaise(grandTotalPaise)}</span>
          </div>
        </div>

        <div className="action-row">
          <button
            className="btn btn-primary"
            style={{ flex: 1, padding: "14px" }}
            disabled={isSubmitting || cartItems.filter((i) => i.product_id).length === 0}
            onClick={handleSaveBill}
          >
            {isSubmitting ? "Saving Transaction…" : "💾 Save Bill Securely"}
          </button>
          <button className="btn btn-secondary" onClick={handleTriggerPrint}>
            🖨️ Print Invoice Preview
          </button>
          <button className="btn btn-secondary" onClick={handleClearForm}>
            🗑️ Clear Form
          </button>
        </div>
      </div>
    </div>
  );
};
