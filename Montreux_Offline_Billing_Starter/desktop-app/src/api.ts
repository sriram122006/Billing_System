import { invoke } from "@tauri-apps/api/core";
import type {
  Product,
  ProductInput,
  SaleRequest,
  SaleResponse,
  BillSummary,
  BillDetail,
  BillFilter,
  DashboardStats,
  ShopSettings,
  ImportResult,
} from "./types";

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// -------------------------------------------------------------
// In-Memory / Browser Fallback State for Web Preview
// -------------------------------------------------------------

const DEFAULT_SETTINGS: ShopSettings = {
  shop_name: "Montreux Clothing",
  owner_name: "",
  shop_phone: "",
  shop_gst: "",
  shop_address: "",
  invoice_footer: "Thank you for shopping at Montreux Clothing!",
  gst_rate_percent: 18.0,
  tax_confirmed: false,
};

let mockProducts: Product[] = [
  { id: 1, name: "Shirt - ₹350", price_paise: 35000, stock: 50, threshold: 10, is_active: true },
  { id: 2, name: "Shirt - ₹500", price_paise: 50000, stock: 40, threshold: 10, is_active: true },
  { id: 3, name: "Shirt - ₹600", price_paise: 60000, stock: 35, threshold: 10, is_active: true },
  { id: 4, name: "Pant - ₹550", price_paise: 55000, stock: 45, threshold: 10, is_active: true },
  { id: 5, name: "Pant - ₹650", price_paise: 65000, stock: 30, threshold: 10, is_active: true },
  { id: 6, name: "Pant - ₹750", price_paise: 75000, stock: 25, threshold: 10, is_active: true },
  { id: 7, name: "T-Shirt - ₹390", price_paise: 39000, stock: 60, threshold: 10, is_active: true },
  { id: 8, name: "Track Pants - ₹290", price_paise: 29000, stock: 40, threshold: 10, is_active: true },
  { id: 9, name: "Track Pants - ₹390", price_paise: 39000, stock: 35, threshold: 10, is_active: true },
  { id: 10, name: "Half Shorts - ₹290", price_paise: 29000, stock: 55, threshold: 10, is_active: true },
];

let mockBills: BillSummary[] = [];
let mockBillItems: Array<BillDetail["items"][0]> = [];
let mockSettings: ShopSettings = { ...DEFAULT_SETTINGS };
let mockInvoiceCounter = 1000;

// -------------------------------------------------------------
// Unified API Surface
// -------------------------------------------------------------

export async function getProducts(): Promise<Product[]> {
  if (isTauriEnvironment()) {
    return await invoke<Product[]>("get_products");
  }
  return [...mockProducts];
}

export async function saveProduct(product: ProductInput): Promise<void> {
  if (isTauriEnvironment()) {
    return await invoke<void>("save_product", { product });
  }

  if (product.id) {
    const idx = mockProducts.findIndex((p) => p.id === product.id);
    if (idx !== -1) {
      mockProducts[idx] = {
        ...mockProducts[idx],
        name: product.name.trim(),
        price_paise: product.price_paise,
        stock: product.stock,
        threshold: product.threshold,
      };
    }
  } else {
    mockProducts.push({
      id: Date.now(),
      name: product.name.trim(),
      price_paise: product.price_paise,
      stock: product.stock,
      threshold: product.threshold,
      is_active: true,
    });
  }
}

export async function adjustStock(productId: number, delta: number, reason: string): Promise<void> {
  if (isTauriEnvironment()) {
    return await invoke<void>("adjust_stock", { productId, delta, reason });
  }

  const p = mockProducts.find((item) => item.id === productId);
  if (!p) throw new Error("Product not found.");
  if (p.stock + delta < 0) throw new Error("Stock cannot fall below zero.");
  p.stock += delta;
}

export async function deleteProduct(productId: number): Promise<void> {
  if (isTauriEnvironment()) {
    return await invoke<void>("delete_product", { productId });
  }

  const isUsed = mockBillItems.some((bi) => bi.product_id === productId);
  if (isUsed) {
    const p = mockProducts.find((item) => item.id === productId);
    if (p) p.is_active = false;
  } else {
    mockProducts = mockProducts.filter((p) => p.id !== productId);
  }
}

export async function createSale(sale: SaleRequest): Promise<SaleResponse> {
  if (isTauriEnvironment()) {
    return await invoke<SaleResponse>("create_sale", { sale });
  }

  // Pre-validate stock in mock
  const requestedMap = new Map<number, number>();
  for (const item of sale.items) {
    requestedMap.set(item.product_id, (requestedMap.get(item.product_id) || 0) + item.quantity);
  }

  for (const [prodId, reqQty] of requestedMap.entries()) {
    const p = mockProducts.find((item) => item.id === prodId);
    if (!p) throw new Error(`Product ${prodId} not found.`);
    if (p.stock < reqQty) {
      throw new Error(`Insufficient stock for "${p.name}": requested ${reqQty}, available ${p.stock}.`);
    }
  }

  // Compute math
  let subtotal = 0;
  for (const item of sale.items) {
    const p = mockProducts.find((prod) => prod.id === item.product_id)!;
    subtotal += p.price_paise * item.quantity;
  }

  const percentDiscount = Math.round(subtotal * (sale.discount_percent / 100));
  const totalDiscount = Math.min(subtotal, percentDiscount + sale.discount_flat_paise);
  const afterDiscount = subtotal - totalDiscount;
  const gstAmount = sale.apply_gst ? Math.round(afterDiscount * (mockSettings.gst_rate_percent / 100)) : 0;
  const grandTotal = afterDiscount + gstAmount;

  const billNo = `MC${mockInvoiceCounter++}`;
  const billId = Date.now();

  const newBill: BillSummary = {
    id: billId,
    bill_no: billNo,
    date: sale.date,
    customer_name: sale.customer_name.trim(),
    customer_phone: sale.customer_phone.trim(),
    payment_method: sale.payment_method,
    subtotal_paise: subtotal,
    total_discount_paise: totalDiscount,
    gst_amount_paise: gstAmount,
    grand_total_paise: grandTotal,
    status: "COMPLETED",
    items_count: sale.items.length,
    created_at: new Date().toISOString(),
  };

  mockBills.unshift(newBill);

  for (const item of sale.items) {
    const p = mockProducts.find((prod) => prod.id === item.product_id)!;
    p.stock -= item.quantity;
    mockBillItems.push({
      id: Date.now() + Math.random(),
      bill_id: billId,
      product_id: p.id,
      product_name_snapshot: p.name,
      size: item.size,
      price_paise: p.price_paise,
      quantity: item.quantity,
      total_paise: p.price_paise * item.quantity,
    });
  }

  return {
    id: billId,
    bill_no: billNo,
    total_paise: grandTotal,
  };
}

export async function cancelSale(billId: number, reason: string): Promise<void> {
  if (isTauriEnvironment()) {
    return await invoke<void>("cancel_sale", { billId, reason });
  }

  const bill = mockBills.find((b) => b.id === billId);
  if (!bill) throw new Error("Bill not found.");
  if (bill.status !== "COMPLETED") throw new Error(`Bill status is already ${bill.status}.`);

  bill.status = "CANCELLED";
  const items = mockBillItems.filter((i) => i.bill_id === billId);
  for (const it of items) {
    const p = mockProducts.find((prod) => prod.id === it.product_id);
    if (p) p.stock += it.quantity;
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (isTauriEnvironment()) {
    return await invoke<DashboardStats>("get_dashboard_stats");
  }

  const today = new Date().toISOString().slice(0, 10);
  const activeBills = mockBills.filter((b) => b.status === "COMPLETED");
  const todayBills = activeBills.filter((b) => b.date === today);

  const totalRevenue = activeBills.reduce((acc, b) => acc + b.grand_total_paise, 0);
  const todaySales = todayBills.reduce((acc, b) => acc + b.grand_total_paise, 0);

  const todayBillIds = new Set(todayBills.map((b) => b.id));
  const itemsSoldToday = mockBillItems
    .filter((bi) => todayBillIds.has(bi.bill_id))
    .reduce((acc, bi) => acc + bi.quantity, 0);

  const lowStock = mockProducts.filter((p) => p.is_active && p.stock <= p.threshold);

  return {
    total_revenue_paise: totalRevenue,
    total_bills: activeBills.length,
    today_sales_paise: todaySales,
    items_sold_today: itemsSoldToday,
    recent_bills: mockBills.slice(0, 10),
    low_stock_products: lowStock,
  };
}

export async function getBills(filter: BillFilter): Promise<BillSummary[]> {
  if (isTauriEnvironment()) {
    return await invoke<BillSummary[]>("get_bills", { filter });
  }

  return mockBills.filter((b) => {
    if (filter.search_customer && !b.customer_name.toLowerCase().includes(filter.search_customer.toLowerCase())) {
      return false;
    }
    if (filter.date_from && b.date < filter.date_from) return false;
    if (filter.date_to && b.date > filter.date_to) return false;
    if (filter.status && filter.status !== "ALL" && b.status !== filter.status) return false;
    return true;
  });
}

export async function getBillDetail(billId: number): Promise<BillDetail> {
  if (isTauriEnvironment()) {
    return await invoke<BillDetail>("get_bill_detail", { billId });
  }

  const bill = mockBills.find((b) => b.id === billId);
  if (!bill) throw new Error("Bill not found.");
  const items = mockBillItems.filter((i) => i.bill_id === billId);
  return { bill, items };
}

export async function getSettings(): Promise<ShopSettings> {
  if (isTauriEnvironment()) {
    return await invoke<ShopSettings>("get_settings");
  }
  return { ...mockSettings };
}

export async function saveSettings(settings: ShopSettings): Promise<void> {
  if (isTauriEnvironment()) {
    return await invoke<void>("save_settings", { settings });
  }
  mockSettings = { ...settings };
}

export async function exportBackup(): Promise<string> {
  if (isTauriEnvironment()) {
    return await invoke<string>("export_backup");
  }

  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    products: mockProducts,
    bills: mockBills,
    bill_items: mockBillItems,
    settings: mockSettings,
    invoice_sequence: mockInvoiceCounter,
  };
  return JSON.stringify(payload, null, 2);
}

export async function importBackup(jsonData: string): Promise<ImportResult> {
  if (isTauriEnvironment()) {
    return await invoke<ImportResult>("import_backup", { jsonData });
  }

  const data = JSON.parse(jsonData);
  if (!Array.isArray(data.products) || !Array.isArray(data.bills)) {
    throw new Error("Invalid backup format.");
  }
  mockProducts = data.products;
  mockBills = data.bills;
  mockBillItems = data.bill_items || [];
  if (data.settings) mockSettings = data.settings;
  if (data.invoice_sequence) mockInvoiceCounter = data.invoice_sequence;

  return {
    products_imported: mockProducts.length,
    bills_imported: mockBills.length,
    items_imported: mockBillItems.length,
  };
}

export async function exportCsv(filter: BillFilter): Promise<string> {
  if (isTauriEnvironment()) {
    return await invoke<string>("export_csv", { filter });
  }

  const bills = await getBills(filter);
  let csv = "Bill No,Date,Customer,Phone,Payment,Items Count,Subtotal (₹),Discount (₹),GST (₹),Grand Total (₹),Status\n";
  for (const b of bills) {
    const cust = `"${b.customer_name.replace(/"/g, '""')}"`;
    const phone = `"${b.customer_phone.replace(/"/g, '""')}"`;
    csv += `${b.bill_no},${b.date},${cust},${phone},${b.payment_method},${b.items_count},${(b.subtotal_paise / 100).toFixed(2)},${(b.total_discount_paise / 100).toFixed(2)},${(b.gst_amount_paise / 100).toFixed(2)},${(b.grand_total_paise / 100).toFixed(2)},${b.status}\n`;
  }
  return csv;
}
