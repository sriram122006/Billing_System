"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const database_1 = require("./database");
const sourcePath = process.env.MONTREUX_SOURCE_DB;
const targetPath = process.env.MONTREUX_TARGET_DB;
const recoveryPath = `${targetPath ?? ''}-recovery.db`;
if (!sourcePath || !targetPath)
    throw new Error('MONTREUX_SOURCE_DB and MONTREUX_TARGET_DB are required.');
function removeDb(path) {
    for (const suffix of ['', '-shm', '-wal']) {
        try {
            fs_1.default.unlinkSync(`${path}${suffix}`);
        }
        catch { }
    }
}
electron_1.app.whenReady().then(() => {
    removeDb(sourcePath);
    removeDb(targetPath);
    (0, database_1.initializeDb)(sourcePath);
    const source = (0, database_1.openDb)(sourcePath);
    const sourceProduct = (0, database_1.getProducts)(source)[0];
    const sourceVariant = sourceProduct.variants[0];
    const sale = (0, database_1.createSale)(source, {
        date: '2026-10-26', idempotency_key: 'BACKUP-SMOKE-SALE',
        customer_name: 'Backup Test', customer_phone: '', payment_method: 'Cash',
        items: [{ product_id: sourceProduct.id, variant_id: sourceVariant.id, size: sourceVariant.size, quantity: 1 }],
        discount_percent: 0, discount_flat_paise: 0, apply_gst: false,
    });
    source.exec(`
    INSERT INTO customers(id, name, phone, email, notes, is_active) VALUES(501, 'Recovery Customer', '9000000000', '', '', 1);
    INSERT INTO suppliers(id, name, phone, email, address, is_active) VALUES(601, 'Recovery Supplier', '', '', '', 1);
    UPDATE bills SET customer_id=501 WHERE id=${sale.id};
    INSERT INTO purchases(id, receipt_no, supplier_id, received_at, notes, total_paise, status)
      VALUES(701, 'RECOVERY-RECEIPT', 601, '2026-10-26', 'Recovery fixture', 10000, 'RECEIVED');
    INSERT INTO purchase_items(id, purchase_id, variant_id, quantity, unit_cost_paise, total_paise)
      VALUES(801, 701, ${sourceVariant.id}, 2, 5000, 10000);
    INSERT INTO stock_movements(id, variant_id, product_id, movement_type, quantity, reference_type, reference_id, reason)
      VALUES(901, ${sourceVariant.id}, ${sourceProduct.id}, 'PURCHASE_RECEIPT', 2, 'PURCHASE', '701', 'Recovery fixture');
    INSERT INTO returns(id, bill_id, reason, refund_method, total_paise)
      VALUES(1001, ${sale.id}, 'Recovery fixture', 'Cash', 100);
    INSERT INTO return_items(id, return_id, bill_item_id, quantity, restock)
      VALUES(1101, 1001, (SELECT id FROM bill_items WHERE bill_id=${sale.id} LIMIT 1), 1, 0);
  `);
    const backup = (0, database_1.exportBackup)(source);
    const backupData = JSON.parse(backup);
    source.close();
    (0, database_1.initializeDb)(targetPath);
    const target = (0, database_1.openDb)(targetPath);
    const before = target.prepare('SELECT COUNT(*) AS count FROM products').get();
    try {
        (0, database_1.importBackup)(target, JSON.stringify({ version: 999 }));
        throw new Error('Unsupported backup accepted.');
    }
    catch (error) {
        if (!(error instanceof Error) || !/unsupported backup/i.test(error.message))
            throw error;
    }
    const afterInvalid = target.prepare('SELECT COUNT(*) AS count FROM products').get();
    if (afterInvalid.count !== before.count)
        throw new Error('Invalid restore changed live data.');
    const safetyPath = `${targetPath}.pre-restore-smoke.json`;
    fs_1.default.writeFileSync(safetyPath, (0, database_1.exportBackup)(target), { encoding: 'utf8', flag: 'wx' });
    (0, database_1.importBackup)(target, backup);
    const restoredProduct = (0, database_1.getProducts)(target).find(product => product.id === sourceProduct.id);
    const restoredVariant = restoredProduct?.variants?.find(variant => variant.id === sourceVariant.id);
    const restoredBill = target.prepare('SELECT id, bill_no FROM bills WHERE id=?').get(sale.id);
    const restoredItem = target.prepare('SELECT variant_id FROM bill_items WHERE bill_id=?').get(sale.id);
    if (!restoredProduct || !restoredVariant || !restoredBill || restoredBill.bill_no !== sale.bill_no || restoredItem?.variant_id !== sourceVariant.id) {
        throw new Error('Restore did not preserve product, variant or invoice references.');
    }
    const originalSafety = JSON.parse(fs_1.default.readFileSync(safetyPath, 'utf8'));
    if (!Array.isArray(originalSafety.products) || !Array.isArray(originalSafety.bills) ||
        !originalSafety.tables || Object.keys(originalSafety.tables).length !== 15)
        throw new Error('Safety backup is incomplete.');
    const requiredTables = [
        'schema_migrations', 'products', 'product_variants', 'customers', 'suppliers',
        'bills', 'bill_items', 'purchases', 'purchase_items', 'stock_movements',
        'returns', 'return_items', 'settings', 'invoice_sequences', 'audit_logs',
    ];
    for (const table of requiredTables) {
        const count = target.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count;
        if (count !== backupData.tables[table].length)
            throw new Error(`Restored ${table} row count does not match.`);
    }
    removeDb(recoveryPath);
    (0, database_1.initializeDb)(recoveryPath);
    const recovery = (0, database_1.openDb)(recoveryPath);
    (0, database_1.importBackup)(recovery, fs_1.default.readFileSync(safetyPath, 'utf8'));
    if (recovery.prepare('SELECT COUNT(*) AS count FROM products').get().count !== originalSafety.tables.products.length) {
        throw new Error('Safety backup recovery did not restore the original target state.');
    }
    recovery.close();
    console.log(JSON.stringify({
        source_bill: sale.bill_no,
        restored_product_id: restoredProduct.id,
        restored_variant_id: restoredVariant.id,
        safety_backup_created: fs_1.default.existsSync(safetyPath),
        restored_stock: restoredVariant.stock,
    }));
    target.close();
    removeDb(sourcePath);
    removeDb(targetPath);
    removeDb(recoveryPath);
    fs_1.default.unlinkSync(safetyPath);
    void backupData;
    electron_1.app.quit();
}).catch(error => {
    console.error(error);
    electron_1.app.exit(1);
});
