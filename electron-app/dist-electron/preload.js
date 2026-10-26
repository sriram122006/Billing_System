"use strict";
/**
 * preload.ts — Secure contextBridge preload script.
 * Exposes ONLY named, narrowly-scoped IPC methods to the renderer.
 * Never exposes raw ipcRenderer, __dirname, or any Node API.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Type-safe wrapper around ipcRenderer.invoke
const invoke = (channel, ...args) => electron_1.ipcRenderer.invoke(channel, ...args);
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
function safeInvoke(channel, ...args) {
    if (!ALLOWED_CHANNELS.has(channel)) {
        throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return invoke(channel, ...args);
}
// ─── Exposed API surface ─────────────────────────────────────────────────────
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Products
    getProducts: () => safeInvoke('db:getProducts'),
    saveProduct: (product) => safeInvoke('db:saveProduct', product),
    adjustStock: (productId, delta, reason) => safeInvoke('db:adjustStock', productId, delta, reason),
    deleteProduct: (productId) => safeInvoke('db:deleteProduct', productId),
    saveVariant: (variant) => safeInvoke('db:saveVariant', variant),
    deleteVariant: (variantId) => safeInvoke('db:deleteVariant', variantId),
    getCustomers: (search) => safeInvoke('db:getCustomers', search),
    saveCustomer: (customer) => safeInvoke('db:saveCustomer', customer),
    archiveCustomer: (customerId) => safeInvoke('db:archiveCustomer', customerId),
    getSuppliers: (search) => safeInvoke('db:getSuppliers', search),
    saveSupplier: (supplier) => safeInvoke('db:saveSupplier', supplier),
    getPurchases: () => safeInvoke('db:getPurchases'),
    createPurchase: (purchase) => safeInvoke('db:createPurchase', purchase),
    getStockMovements: () => safeInvoke('db:getStockMovements'),
    getReturns: () => safeInvoke('db:getReturns'),
    createReturn: (request) => safeInvoke('db:createReturn', request),
    // Billing
    createSale: (sale) => safeInvoke('db:createSale', sale),
    cancelSale: (billId, reason) => safeInvoke('db:cancelSale', billId, reason),
    // Queries
    getDashboardStats: () => safeInvoke('db:getDashboardStats'),
    getBills: (filter) => safeInvoke('db:getBills', filter),
    getBillDetail: (billId) => safeInvoke('db:getBillDetail', billId),
    // Settings
    getSettings: () => safeInvoke('db:getSettings'),
    saveSettings: (settings) => safeInvoke('db:saveSettings', settings),
    // Backup / Restore / Export
    exportBackup: () => safeInvoke('db:exportBackup'),
    importBackup: (jsonData) => safeInvoke('db:importBackup', jsonData),
    exportCsv: (filter) => safeInvoke('db:exportCsv', filter),
    // File dialogs
    saveFile: (opts) => safeInvoke('dialog:saveFile', opts),
    openFile: (opts) => safeInvoke('dialog:openFile', opts),
    // Printing
    printInvoice: (htmlContent) => safeInvoke('print:invoice', htmlContent),
    getPrinters: () => safeInvoke('print:getPrinters'),
});
