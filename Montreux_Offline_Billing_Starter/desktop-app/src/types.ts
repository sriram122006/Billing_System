export type Product = {
  id: number;
  name: string;
  price_paise: number;
  stock: number;
  threshold: number;
  is_active: boolean;
};

export type ProductInput = {
  id: number | null;
  name: string;
  price_paise: number;
  stock: number;
  threshold: number;
};

export type SaleLineInput = {
  product_id: number;
  size: string;
  quantity: number;
};

export type SaleRequest = {
  date: string;
  customer_name: string;
  customer_phone: string;
  payment_method: "Cash" | "UPI" | "Card" | "Pending";
  items: SaleLineInput[];
  discount_percent: number;
  discount_flat_paise: number;
  apply_gst: boolean;
};

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
  status: "COMPLETED" | "CANCELLED" | "REFUNDED";
  items_count: number;
  created_at: string;
};

export type BillDetail = {
  bill: BillSummary;
  items: BillItemDetail[];
};

export type BillFilter = {
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
  product_id: number | "";
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
