"use strict";
/**
 * main.ts — Electron main process entry point.
 * Owns: app lifecycle, BrowserWindow, IPC handlers, database access.
 * Security: nodeIntegration=false, contextIsolation=true, no remote content.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("./database");
// ─── App State ──────────────────────────────────────────────────────────────
let mainWindow = null;
let db = null;
const isDev = process.env.NODE_ENV === 'development';
// ─── Window Creation ─────────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        title: 'Montreux Billing',
        backgroundColor: '#1a0a0f',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false, // Security: renderer cannot access Node APIs
            contextIsolation: true, // Security: preload runs in isolated context
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
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
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
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
}
// ─── App Lifecycle ────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    // Initialize database from OS user-data directory
    const dbPath = (0, database_1.resolveDbPath)(electron_1.app.getPath('userData'));
    db = (0, database_1.openDb)(dbPath);
    (0, database_1.initializeDb)(dbPath);
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('quit', () => {
    db?.close();
});
// ─── IPC Helpers ─────────────────────────────────────────────────────────────
/**
 * Wraps an IPC handler, ensuring db is ready and errors are serialized cleanly.
 */
function handle(channel, fn) {
    electron_1.ipcMain.handle(channel, async (event, ...args) => {
        assertTrustedRenderer(event);
        if (!db)
            throw new Error('Database not initialized.');
        try {
            return fn(...args);
        }
        catch (err) {
            // Re-throw as plain string so it serializes cleanly across the context bridge
            throw new Error(err?.message ?? String(err));
        }
    });
}
function assertTrustedRenderer(event) {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
        throw new Error('IPC request rejected: untrusted renderer.');
    }
    const url = event.senderFrame?.url ?? '';
    if (isDev ? !url.startsWith('http://localhost:') : !url.startsWith('file://')) {
        throw new Error('IPC request rejected: unexpected renderer origin.');
    }
}
// ─── IPC Handlers — Products ─────────────────────────────────────────────────
handle('db:getProducts', () => (0, database_1.getProducts)(db));
handle('db:saveProduct', (product) => (0, database_1.saveProduct)(db, product));
handle('db:adjustStock', (productId, delta, reason) => (0, database_1.adjustStock)(db, productId, delta, reason));
handle('db:deleteProduct', (productId) => (0, database_1.deleteProduct)(db, productId));
handle('db:saveVariant', (variant) => (0, database_1.saveVariant)(db, variant));
handle('db:deleteVariant', (variantId) => (0, database_1.deleteVariant)(db, variantId));
handle('db:getCustomers', (search) => (0, database_1.getCustomers)(db, search));
handle('db:saveCustomer', (customer) => (0, database_1.saveCustomer)(db, customer));
handle('db:archiveCustomer', (customerId) => (0, database_1.archiveCustomer)(db, customerId));
handle('db:getSuppliers', (search) => (0, database_1.getSuppliers)(db, search));
handle('db:saveSupplier', (supplier) => (0, database_1.saveSupplier)(db, supplier));
handle('db:getPurchases', () => (0, database_1.getPurchases)(db));
handle('db:createPurchase', (purchase) => (0, database_1.createPurchase)(db, purchase));
handle('db:getStockMovements', () => (0, database_1.getStockMovements)(db));
handle('db:getReturns', () => (0, database_1.getReturns)(db));
handle('db:createReturn', (request) => (0, database_1.createReturn)(db, request));
// ─── IPC Handlers — Billing ──────────────────────────────────────────────────
handle('db:createSale', (sale) => (0, database_1.createSale)(db, sale));
handle('db:cancelSale', (billId, reason) => (0, database_1.cancelSale)(db, billId, reason));
// ─── IPC Handlers — Queries ──────────────────────────────────────────────────
handle('db:getDashboardStats', () => (0, database_1.getDashboardStats)(db));
handle('db:getBills', (filter) => (0, database_1.getBills)(db, filter));
handle('db:getBillDetail', (billId) => (0, database_1.getBillDetail)(db, billId));
// ─── IPC Handlers — Settings ─────────────────────────────────────────────────
handle('db:getSettings', () => (0, database_1.getSettings)(db));
handle('db:saveSettings', (settings) => (0, database_1.saveSettings)(db, settings));
// ─── IPC Handlers — Backup / Restore ─────────────────────────────────────────
handle('db:exportBackup', () => (0, database_1.exportBackup)(db));
handle('db:importBackup', (jsonData) => {
    const backupPath = `${db.name}.pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs_1.default.writeFileSync(backupPath, (0, database_1.exportBackup)(db), { encoding: 'utf8', flag: 'wx' });
    return (0, database_1.importBackup)(db, jsonData);
});
handle('db:exportCsv', (filter) => (0, database_1.exportBillsCsv)(db, filter));
// ─── IPC Handlers — File Dialogs ─────────────────────────────────────────────
electron_1.ipcMain.handle('dialog:saveFile', async (event, { defaultName, content, filterName, ext }) => {
    assertTrustedRenderer(event);
    if (!mainWindow)
        return { success: false, error: 'No window.' };
    const { filePath, canceled } = await electron_1.dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [{ name: filterName, extensions: [ext] }],
    });
    if (canceled || !filePath)
        return { success: false, canceled: true };
    fs_1.default.writeFileSync(filePath, content, 'utf-8');
    return { success: true, filePath };
});
electron_1.ipcMain.handle('dialog:openFile', async (event, { filterName, ext }) => {
    assertTrustedRenderer(event);
    if (!mainWindow)
        return { success: false, error: 'No window.' };
    const { filePaths, canceled } = await electron_1.dialog.showOpenDialog(mainWindow, {
        filters: [{ name: filterName, extensions: [ext] }],
        properties: ['openFile'],
    });
    if (canceled || !filePaths.length)
        return { success: false, canceled: true };
    const content = fs_1.default.readFileSync(filePaths[0], 'utf-8');
    return { success: true, content };
});
// ─── IPC Handlers — Printing ─────────────────────────────────────────────────
electron_1.ipcMain.handle('print:invoice', async (event, htmlContent) => {
    assertTrustedRenderer(event);
    const printWindow = new electron_1.BrowserWindow({
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
electron_1.ipcMain.handle('print:getPrinters', async (event) => {
    assertTrustedRenderer(event);
    if (!mainWindow)
        return [];
    return mainWindow.webContents.getPrintersAsync();
});
