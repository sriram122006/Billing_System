/**
 * api.ts — Typed renderer-side IPC service layer.
 * Calls window.electronAPI (exposed by preload.ts via contextBridge).
 * No raw ipcRenderer, no Node access, no Tauri imports.
 */

import type {
  Product, ProductInput, ProductVariant, SaleRequest, SaleResponse,
  BillSummary, BillDetail, BillFilter, DashboardStats,
  ShopSettings, ImportResult, SaveFileOpts, OpenFileOpts, PrinterInfo,
  Customer, CustomerInput,
  Supplier, SupplierInput, PurchaseRequest, PurchaseSummary, StockMovement,
  ReturnRequest, ReturnSummary,
} from './types';

// The window.electronAPI type (matches preload.ts exports)
declare global {
  interface Window {
    electronAPI: {
      getProducts(): Promise<Product[]>;
      saveProduct(product: ProductInput): Promise<void>;
      adjustStock(productId: number, delta: number, reason: string): Promise<void>;
      deleteProduct(productId: number): Promise<void>;
      saveVariant(variant: Omit<ProductVariant, "id"> & { id?: number }): Promise<ProductVariant>;
      deleteVariant(variantId: number): Promise<void>;
      getCustomers(search: string): Promise<Customer[]>;
      saveCustomer(customer: CustomerInput): Promise<Customer>;
      archiveCustomer(customerId: number): Promise<void>;
      getSuppliers(search: string): Promise<Supplier[]>;
      saveSupplier(supplier: SupplierInput): Promise<Supplier>;
      getPurchases(): Promise<PurchaseSummary[]>;
      createPurchase(purchase: PurchaseRequest): Promise<PurchaseSummary>;
      getStockMovements(): Promise<StockMovement[]>;
      getReturns(): Promise<ReturnSummary[]>;
      createReturn(request: ReturnRequest): Promise<ReturnSummary>;
      createSale(sale: SaleRequest): Promise<SaleResponse>;
      cancelSale(billId: number, reason: string): Promise<void>;
      getDashboardStats(): Promise<DashboardStats>;
      getBills(filter: BillFilter): Promise<BillSummary[]>;
      getBillDetail(billId: number): Promise<BillDetail>;
      getSettings(): Promise<ShopSettings>;
      saveSettings(settings: ShopSettings): Promise<void>;
      exportBackup(): Promise<string>;
      importBackup(jsonData: string): Promise<ImportResult>;
      exportCsv(filter: BillFilter): Promise<string>;
      saveFile(opts: SaveFileOpts): Promise<{ success: boolean; canceled?: boolean; filePath?: string }>;
      openFile(opts: OpenFileOpts): Promise<{ success: boolean; canceled?: boolean; content?: string }>;
      printInvoice(htmlContent: string): Promise<{ success: boolean }>;
      getPrinters(): Promise<PrinterInfo[]>;
    };
  }
}

function api() {
  if (!window.electronAPI) throw new Error('electronAPI not available — are you running in Electron?');
  return window.electronAPI;
}

// ─── Products ──────────────────────────────────────────────────────────────

export const getProducts = (): Promise<Product[]> => api().getProducts();

export const saveProduct = (product: ProductInput): Promise<void> => api().saveProduct(product);

export const adjustStock = (productId: number, delta: number, reason: string): Promise<void> =>
  api().adjustStock(productId, delta, reason);

export const deleteProduct = (productId: number): Promise<void> => api().deleteProduct(productId);
export const saveVariant = (variant: Omit<ProductVariant, "id"> & { id?: number }): Promise<ProductVariant> =>
  api().saveVariant(variant);
export const deleteVariant = (variantId: number): Promise<void> => api().deleteVariant(variantId);
export const getCustomers = (search = ""): Promise<Customer[]> => api().getCustomers(search);
export const saveCustomer = (customer: CustomerInput): Promise<Customer> => api().saveCustomer(customer);
export const archiveCustomer = (customerId: number): Promise<void> => api().archiveCustomer(customerId);
export const getSuppliers = (search = ""): Promise<Supplier[]> => api().getSuppliers(search);
export const saveSupplier = (supplier: SupplierInput): Promise<Supplier> => api().saveSupplier(supplier);
export const getPurchases = (): Promise<PurchaseSummary[]> => api().getPurchases();
export const createPurchase = (purchase: PurchaseRequest): Promise<PurchaseSummary> => api().createPurchase(purchase);
export const getStockMovements = (): Promise<StockMovement[]> => api().getStockMovements();
export const getReturns = (): Promise<ReturnSummary[]> => api().getReturns();
export const createReturn = (request: ReturnRequest): Promise<ReturnSummary> => api().createReturn(request);

// ─── Billing ───────────────────────────────────────────────────────────────

export const createSale = (sale: SaleRequest): Promise<SaleResponse> => api().createSale(sale);

export const cancelSale = (billId: number, reason: string): Promise<void> =>
  api().cancelSale(billId, reason);

// ─── Queries ───────────────────────────────────────────────────────────────

export const getDashboardStats = (): Promise<DashboardStats> => api().getDashboardStats();

export const getBills = (filter: BillFilter): Promise<BillSummary[]> => api().getBills(filter);

export const getBillDetail = (billId: number): Promise<BillDetail> => api().getBillDetail(billId);

// ─── Settings ──────────────────────────────────────────────────────────────

export const getSettings = (): Promise<ShopSettings> => api().getSettings();

export const saveSettings = (settings: ShopSettings): Promise<void> => api().saveSettings(settings);

// ─── Backup / Export ───────────────────────────────────────────────────────

export const exportBackup = (): Promise<string> => api().exportBackup();

export const importBackup = (jsonData: string): Promise<ImportResult> => api().importBackup(jsonData);

export const exportCsv = (filter: BillFilter): Promise<string> => api().exportCsv(filter);

// ─── File Dialogs ──────────────────────────────────────────────────────────

export const saveFile = (opts: SaveFileOpts) => api().saveFile(opts);

export const openFile = (opts: OpenFileOpts) => api().openFile(opts);

// ─── Printing ──────────────────────────────────────────────────────────────

export const printInvoice = (htmlContent: string) => api().printInvoice(htmlContent);

export const getPrinters = () => api().getPrinters();
