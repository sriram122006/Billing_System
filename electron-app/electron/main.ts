/**
 * main.ts — Electron main process entry point.
 * Owns: app lifecycle, BrowserWindow, IPC handlers, database access.
 * Security: nodeIntegration=false, contextIsolation=true, no remote content.
 */

import { app, BrowserWindow, ipcMain, dialog, shell, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import {
  initializeDb, openDb, resolveDbPath,
  getProducts, saveProduct, adjustStock, deleteProduct,
  saveVariant, deleteVariant,
  getCustomers, saveCustomer, archiveCustomer,
  getSuppliers, saveSupplier, getPurchases, createPurchase, getStockMovements,
  getReturns, createReturn,
  createSale, cancelSale,
  getDashboardStats, getBills, getBillDetail,
  getSettings, saveSettings,
  exportBackup, importBackup, exportBillsCsv,
} from './database';
import type {
  ProductInput, SaleRequest, BillFilter, ShopSettings,
  ProductVariant,
  CustomerInput,
  SupplierInput, PurchaseRequest,
  ReturnRequest,
} from './database';

// ─── App State ──────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let db: Database.Database | null = null;

const isDev = process.env.NODE_ENV === 'development';

// ─── Window Creation ─────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Montreux Billing',
    backgroundColor: '#1a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,           // Security: renderer cannot access Node APIs
      contextIsolation: true,           // Security: preload runs in isolated context
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev,
    },
  });

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  // Block navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  // Open external links in system browser, not in-app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Initialize database from OS user-data directory
  const dbPath = resolveDbPath(app.getPath('userData'));
  db = openDb(dbPath);
  initializeDb(dbPath);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  db?.close();
});

// ─── IPC Helpers ─────────────────────────────────────────────────────────────

/**
 * Wraps an IPC handler, ensuring db is ready and errors are serialized cleanly.
 */
function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args) => {
    assertTrustedRenderer(event);
    if (!db) throw new Error('Database not initialized.');
    try {
      return fn(...args);
    } catch (err: any) {
      // Re-throw as plain string so it serializes cleanly across the context bridge
      throw new Error(err?.message ?? String(err));
    }

  });
}

function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('IPC request rejected: untrusted renderer.');
  }
  const url = event.senderFrame?.url ?? '';
  if (isDev ? !url.startsWith('http://localhost:') : !url.startsWith('file://')) {
    throw new Error('IPC request rejected: unexpected renderer origin.');
  }
}

// ─── IPC Handlers — Products ─────────────────────────────────────────────────

handle('db:getProducts', () => getProducts(db!));

handle('db:saveProduct', (product: ProductInput) => saveProduct(db!, product));

handle('db:adjustStock', (productId: number, delta: number, reason: string) =>
  adjustStock(db!, productId, delta, reason));

handle('db:deleteProduct', (productId: number) => deleteProduct(db!, productId));
handle('db:saveVariant', (variant: Omit<ProductVariant, 'id'> & { id?: number }) => saveVariant(db!, variant));
handle('db:deleteVariant', (variantId: number) => deleteVariant(db!, variantId));
handle('db:getCustomers', (search: string) => getCustomers(db!, search));
handle('db:saveCustomer', (customer: CustomerInput) => saveCustomer(db!, customer));
handle('db:archiveCustomer', (customerId: number) => archiveCustomer(db!, customerId));
handle('db:getSuppliers', (search: string) => getSuppliers(db!, search));
handle('db:saveSupplier', (supplier: SupplierInput) => saveSupplier(db!, supplier));
handle('db:getPurchases', () => getPurchases(db!));
handle('db:createPurchase', (purchase: PurchaseRequest) => createPurchase(db!, purchase));
handle('db:getStockMovements', () => getStockMovements(db!));
handle('db:getReturns', () => getReturns(db!));
handle('db:createReturn', (request: ReturnRequest) => createReturn(db!, request));

// ─── IPC Handlers — Billing ──────────────────────────────────────────────────

handle('db:createSale', (sale: SaleRequest) => createSale(db!, sale));

handle('db:cancelSale', (billId: number, reason: string) => cancelSale(db!, billId, reason));

// ─── IPC Handlers — Queries ──────────────────────────────────────────────────

handle('db:getDashboardStats', () => getDashboardStats(db!));

handle('db:getBills', (filter: BillFilter) => getBills(db!, filter));

handle('db:getBillDetail', (billId: number) => getBillDetail(db!, billId));

// ─── IPC Handlers — Settings ─────────────────────────────────────────────────

handle('db:getSettings', () => getSettings(db!));

handle('db:saveSettings', (settings: ShopSettings) => saveSettings(db!, settings));

// ─── IPC Handlers — Backup / Restore ─────────────────────────────────────────

handle('db:exportBackup', () => exportBackup(db!));

handle('db:importBackup', (jsonData: string) => {
  const backupPath = `${db!.name}.pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(backupPath, exportBackup(db!), { encoding: 'utf8', flag: 'wx' });
  return importBackup(db!, jsonData);
});

handle('db:exportCsv', (filter: BillFilter) => exportBillsCsv(db!, filter));

// ─── IPC Handlers — File Dialogs ─────────────────────────────────────────────

ipcMain.handle('dialog:saveFile', async (event, { defaultName, content, filterName, ext }: {
  defaultName: string; content: string; filterName: string; ext: string;
}) => {
  assertTrustedRenderer(event);
  if (!mainWindow) return { success: false, error: 'No window.' };
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions: [ext] }],
  });
  if (canceled || !filePath) return { success: false, canceled: true };
  fs.writeFileSync(filePath, content, 'utf-8');
  return { success: true, filePath };
});

ipcMain.handle('dialog:openFile', async (event, { filterName, ext }: {
  filterName: string; ext: string;
}) => {
  assertTrustedRenderer(event);
  if (!mainWindow) return { success: false, error: 'No window.' };
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: filterName, extensions: [ext] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { success: false, canceled: true };
  const content = fs.readFileSync(filePaths[0], 'utf-8');
  return { success: true, content };
});

// ─── IPC Handlers — Printing ─────────────────────────────────────────────────

ipcMain.handle('print:invoice', async (event, htmlContent: string) => {
  assertTrustedRenderer(event);
  const printWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
    printWindow.close();
  });
  return { success: true };
});

ipcMain.handle('print:getPrinters', async (event) => {
  assertTrustedRenderer(event);
  if (!mainWindow) return [];
  return mainWindow.webContents.getPrintersAsync();
});
