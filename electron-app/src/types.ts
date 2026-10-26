// types.ts — shared TypeScript types for renderer and main process

export type Product = {
  id: number;
  name: string;
  size: string;
  category: string;
  size_scale: string;
  size_options: string;
  price_paise: number;
  stock: number;
  threshold: number;
  is_active: boolean;
  variants: ProductVariant[];
};

export type ProductVariant = {
  id: number;
  product_id: number;
  size: string;
  color: string;
  sku: string;
  barcode: string;
  price_paise: number | null;
  stock: number;
  stock_adjustment_reason?: string;
};

export type ProductInput = {
  id: number | null;
  name: string;
  size: string;
  category: string;
  size_scale: string;
  size_options: string;
  price_paise: number;
  stock: number;
  threshold: number;
  selected_sizes?: string[];
  size_stocks?: Record<string, number>;
};

export type SaleLineInput = {
  product_id: number;
  variant_id: number;
  size: string;
  quantity: number;
};

export type SaleRequest = {
  date: string;
  idempotency_key?: string;
  customer_id?: number | null;
  customer_name: string;
  customer_phone: string;
  payment_method: 'Cash' | 'UPI' | 'Card' | 'Pending';
  items: SaleLineInput[];
  discount_percent: number;
  discount_flat_paise: number;
  apply_gst: boolean;
  save_customer?: boolean;
  customer_source?: string;
};

export type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  purchase_count: number;
  purchase_total_paise: number;
};

export type CustomerInput = Omit<Customer, "id" | "is_active" | "created_at" | "updated_at" | "purchase_count" | "purchase_total_paise" | "source"> & {
  id?: number;
  source?: string;
};

export type Supplier = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
};
export type SupplierInput = Omit<Supplier, "id" | "is_active"> & { id?: number };
export type PurchaseLineInput = { variant_id: number; quantity: number; unit_cost_paise: number };
export type PurchaseRequest = { receipt_no: string; supplier_id: number; received_at: string; notes: string; items: PurchaseLineInput[] };
export type PurchaseSummary = { id: number; receipt_no: string; supplier_id: number; supplier_name: string; received_at: string; total_paise: number; status: "RECEIVED" | "CANCELLED"; items_count: number };
export type StockMovement = { id: number; variant_id: number | null; product_id: number; product_name: string; variant_label: string; movement_type: string; quantity: number; reference_type: string; reference_id: string; reason: string; created_at: string };
export type ReturnRequest = { bill_id: number; reason: string; refund_method: "Cash" | "UPI" | "Card" | "Pending"; items: Array<{ bill_item_id: number; quantity: number; restock: boolean }> };
export type ReturnSummary = { id: number; bill_id: number; bill_no: string; reason: string; refund_method: string; total_paise: number; created_at: string };

export type SaleResponse = {
  id: number;
  bill_no: string;
  total_paise: number;
};

export type BillItemDetail = {
  id: number;
  bill_id: number;
  product_id: number;
  product_name_snapshot: string;
  size: string;
  price_paise: number;
  quantity: number;
  total_paise: number;
  variant_id?: number;
};

export type BillSummary = {
  id: number;
  bill_no: string;
  date: string;
  customer_name: string;
  customer_phone: string;
  payment_method: string;
  subtotal_paise: number;
  total_discount_paise: number;
  gst_amount_paise: number;
  grand_total_paise: number;
  status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  items_count: number;
  created_at: string;
  idempotency_key?: string | null;
};

export type BillDetail = {
  bill: BillSummary;
  items: BillItemDetail[];
};

export type BillFilter = {
  search_bill_no?: string;
  search_customer?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
};

export type DashboardStats = {
  total_revenue_paise: number;
  total_bills: number;
  today_sales_paise: number;
  items_sold_today: number;
  recent_bills: BillSummary[];
  low_stock_products: Product[];
};

export type ShopSettings = {
  shop_name: string;
  owner_name: string;
  shop_phone: string;
  shop_gst: string;
  shop_address: string;
  invoice_footer: string;
  gst_rate_percent: number;
  tax_confirmed: boolean;
};

export type CartItem = {
  row_id: string;
  product_id: number | '';
  variant_id: number | '';
  size: string;
  quantity: number;
};

export type BackupData = {
  version: number;
  exported_at: string;
  products: Product[];
  bills: BillSummary[];
  bill_items: BillItemDetail[];
  settings: Record<string, string>;
  invoice_sequence: number;
};

export type ImportResult = {
  products_imported: number;
  bills_imported: number;
  items_imported: number;
};

export type SaveFileOpts = {
  defaultName: string;
  content: string;
  filterName: string;
  ext: string;
};

export type OpenFileOpts = {
  filterName: string;
  ext: string;
};

export type PrinterInfo = {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
};
