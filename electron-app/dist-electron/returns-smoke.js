"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const database_1 = require("./database");
const dbPath = process.env.MONTREUX_SMOKE_DB;
if (!dbPath)
    throw new Error('MONTREUX_SMOKE_DB is required.');
electron_1.app.whenReady().then(() => {
    (0, database_1.initializeDb)(dbPath);
    const db = (0, database_1.openDb)(dbPath);
    const product = (0, database_1.getProducts)(db)[0];
    const variant = product.variants[0];
    const sale = (0, database_1.createSale)(db, {
        date: '2026-10-26', customer_name: 'Return Test', customer_phone: '', payment_method: 'Cash',
        items: [{ product_id: product.id, variant_id: variant.id, size: variant.size, quantity: 2 }],
        discount_percent: 0, discount_flat_paise: 0, apply_gst: false,
    });
    const item = db.prepare('SELECT id FROM bill_items WHERE bill_id=?').get(sale.id);
    const before = db.prepare('SELECT stock FROM product_variants WHERE id=?').get(variant.id).stock;
    (0, database_1.createReturn)(db, { bill_id: sale.id, reason: 'Unworn', refund_method: 'Cash', items: [{ bill_item_id: item.id, quantity: 1, restock: true }] });
    const after = db.prepare('SELECT stock FROM product_variants WHERE id=?').get(variant.id).stock;
    if (after !== before + 1 || (0, database_1.getReturns)(db).length !== 1)
        throw new Error('Return did not restore stock.');
    try {
        (0, database_1.createReturn)(db, { bill_id: sale.id, reason: 'Duplicate', refund_method: 'Cash', items: [{ bill_item_id: item.id, quantity: 2, restock: true }] });
        throw new Error('Excess return was accepted.');
    }
    catch (error) {
        if (!(error instanceof Error) || !/exceeds/i.test(error.message))
            throw error;
    }
    console.log(JSON.stringify({ return_count: (0, database_1.getReturns)(db).length, stock_before_return: before, stock_after_return: after }));
    db.close();
    for (const suffix of ['', '-shm', '-wal']) {
        try {
            fs_1.default.unlinkSync(`${dbPath}${suffix}`);
        }
        catch { }
    }
    electron_1.app.quit();
});
