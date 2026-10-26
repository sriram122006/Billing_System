/**
 * preload.ts — Secure contextBridge preload script.
 * Exposes ONLY named, narrowly-scoped IPC methods to the renderer.
 * Never exposes raw ipcRenderer, __dirname, or any Node API.
 */

import { contextBridge, ipcRenderer } from 'electron';

// Type-safe wrapper around ipcRenderer.invoke
const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args);

// Allowlist of valid channels (defence-in-depth)
const ALLOWED_CHANNELS = new Set([
  'db:getProducts', 'db:saveProduct', 'db:adjustStock', 'db:deleteProduct', 'db:saveVariant', 'db:deleteVariant',
  'db:getCustomers', 'db:saveCustomer', 'db:archiveCustomer',
  'db:getSuppliers', 'db:saveSupplier', 'db:getPurchases', 'db:createPurchase', 'db:getStockMovements',
  'db:getReturns', 'db:createReturn',
  'db:createSale', 'db:cancelSale',
  'db:getDashboardStats', 'db:getBills', 'db:getBillDetail',
  'db:getSettings', 'db:saveSettings',
  'db:exportBackup', 'db:importBackup', 'db:exportCsv',
  'dialog:saveFile', 'dialog:openFile',
  'print:invoice', 'print:getPrinters',
]);

// Guarded invoke — throws if channel not in allowlist
function safeInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw new Error(`IPC channel not allowed: ${channel}`);
  }
  return invoke<T>(channel, ...args);
}

// ─── Exposed API surface ─────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('electronAPI', {
  // Products
  getProducts: () => safeInvoke('db:getProducts'),
  saveProduct: (product: unknown) => safeInvoke('db:saveProduct', product),
  adjustStock: (productId: number, delta: number, reason: string) =>
    safeInvoke('db:adjustStock', productId, delta, reason),
  deleteProduct: (productId: number) => safeInvoke('db:deleteProduct', productId),
  saveVariant: (variant: unknown) => safeInvoke('db:saveVariant', variant),
  deleteVariant: (variantId: number) => safeInvoke('db:deleteVariant', variantId),
  getCustomers: (search: string) => safeInvoke('db:getCustomers', search),
  saveCustomer: (customer: unknown) => safeInvoke('db:saveCustomer', customer),
  archiveCustomer: (customerId: number) => safeInvoke('db:archiveCustomer', customerId),
  getSuppliers: (search: string) => safeInvoke('db:getSuppliers', search),
  saveSupplier: (supplier: unknown) => safeInvoke('db:saveSupplier', supplier),
  getPurchases: () => safeInvoke('db:getPurchases'),
  createPurchase: (purchase: unknown) => safeInvoke('db:createPurchase', purchase),
  getStockMovements: () => safeInvoke('db:getStockMovements'),
  getReturns: () => safeInvoke('db:getReturns'),
  createReturn: (request: unknown) => safeInvoke('db:createReturn', request),

  // Billing
  createSale: (sale: unknown) => safeInvoke('db:createSale', sale),
  cancelSale: (billId: number, reason: string) => safeInvoke('db:cancelSale', billId, reason),

  // Queries
  getDashboardStats: () => safeInvoke('db:getDashboardStats'),
  getBills: (filter: unknown) => safeInvoke('db:getBills', filter),
  getBillDetail: (billId: number) => safeInvoke('db:getBillDetail', billId),

  // Settings
  getSettings: () => safeInvoke('db:getSettings'),
  saveSettings: (settings: unknown) => safeInvoke('db:saveSettings', settings),

  // Backup / Restore / Export
  exportBackup: () => safeInvoke('db:exportBackup'),
  importBackup: (jsonData: string) => safeInvoke('db:importBackup', jsonData),
  exportCsv: (filter: unknown) => safeInvoke('db:exportCsv', filter),

  // File dialogs
  saveFile: (opts: unknown) => safeInvoke('dialog:saveFile', opts),
  openFile: (opts: unknown) => safeInvoke('dialog:openFile', opts),

  // Printing
  printInvoice: (htmlContent: string) => safeInvoke('print:invoice', htmlContent),
  getPrinters: () => safeInvoke('print:getPrinters'),
});
