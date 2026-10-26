"use strict";
/**
 * database.ts — SQLite database layer for Electron main process.
 * Ports the Rust db.rs + sales.rs business logic to Node.js using better-sqlite3.
 * All monetary values are in integer paise (1 INR = 100 paise).
 * All mutations inside ACID transactions.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDb = openDb;
exports.initializeDb = initializeDb;
exports.getProducts = getProducts;
exports.getCustomers = getCustomers;
exports.saveCustomer = saveCustomer;
exports.archiveCustomer = archiveCustomer;
exports.getSuppliers = getSuppliers;
exports.saveSupplier = saveSupplier;
exports.getPurchases = getPurchases;
exports.getStockMovements = getStockMovements;
exports.createPurchase = createPurchase;
exports.getReturns = getReturns;
exports.createReturn = createReturn;
exports.saveVariant = saveVariant;
exports.deleteVariant = deleteVariant;
exports.saveProduct = saveProduct;
exports.adjustStock = adjustStock;
exports.deleteProduct = deleteProduct;
exports.getDashboardStats = getDashboardStats;
exports.getBills = getBills;
exports.getBillDetail = getBillDetail;
exports.createSale = createSale;
exports.cancelSale = cancelSale;
exports.getSettings = getSettings;
exports.saveSettings = saveSettings;
exports.exportBackup = exportBackup;
exports.importBackup = importBackup;
exports.exportBillsCsv = exportBillsCsv;
exports.resolveDbPath = resolveDbPath;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ─────────────────────────────────────────────
// DB Singleton
// ─────────────────────────────────────────────
let _db = null;
let _dbPath = '';
function openDb(dbPath) {
    if (_db && _dbPath === dbPath && _db.open)
        return _db;
    _db = new better_sqlite3_1.default(dbPath);
    _dbPath = dbPath;
    // WAL mode + performance pragmas (mirrors Rust PRAGMA setup)
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('synchronous = FULL');
    _db.pragma('temp_store = MEMORY');
    _db.pragma('busy_timeout = 5000');
    return _db;
}
// ─────────────────────────────────────────────
// Schema Initialization & Migrations
// ─────────────────────────────────────────────
function initializeDb(dbPath) {
    const db = openDb(dbPath);
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      size TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      size_scale TEXT NOT NULL DEFAULT 'None',
      size_options TEXT NOT NULL DEFAULT '',
      price_paise INTEGER NOT NULL CHECK(price_paise >= 0),
      stock INTEGER NOT NULL CHECK(stock >= 0),
      threshold INTEGER NOT NULL DEFAULT 5 CHECK(threshold >= 0),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      customer_name TEXT NOT NULL CHECK(length(trim(customer_name)) > 0),
      customer_phone TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL CHECK(payment_method IN ('Cash','UPI','Card','Pending')),
      subtotal_paise INTEGER NOT NULL CHECK(subtotal_paise >= 0),
      discount_percent REAL NOT NULL DEFAULT 0 CHECK(discount_percent >= 0 AND discount_percent <= 100),
      discount_flat_paise INTEGER NOT NULL DEFAULT 0 CHECK(discount_flat_paise >= 0),
      total_discount_paise INTEGER NOT NULL DEFAULT 0,
      apply_gst INTEGER NOT NULL DEFAULT 0 CHECK(apply_gst IN (0,1)),
      gst_rate_percent REAL NOT NULL DEFAULT 18.0,
      gst_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK(gst_amount_paise >= 0),
      grand_total_paise INTEGER NOT NULL CHECK(grand_total_paise >= 0),
      status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED','CANCELLED','REFUNDED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name_snapshot TEXT NOT NULL,
      size TEXT NOT NULL,
      price_paise INTEGER NOT NULL CHECK(price_paise >= 0),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      total_paise INTEGER NOT NULL CHECK(total_paise >= 0)
    );

    CREATE TABLE IF NOT EXISTS invoice_sequences (
      prefix TEXT PRIMARY KEY,
      current_value INTEGER NOT NULL CHECK(current_value >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size TEXT NOT NULL CHECK(length(trim(size)) > 0),
      color TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL DEFAULT '',
      barcode TEXT NOT NULL DEFAULT '',
      price_paise INTEGER CHECK(price_paise IS NULL OR price_paise >= 0),
      stock INTEGER NOT NULL CHECK(stock >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(product_id, size, color)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'Walk-in',
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      received_at TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      total_paise INTEGER NOT NULL CHECK(total_paise >= 0),
      status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','CANCELLED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
      variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_cost_paise INTEGER NOT NULL CHECK(unit_cost_paise >= 0),
      total_paise INTEGER NOT NULL CHECK(total_paise >= 0)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reference_type TEXT NOT NULL DEFAULT '',
      reference_id TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
      reason TEXT NOT NULL CHECK(length(trim(reason)) > 0),
      refund_method TEXT NOT NULL CHECK(refund_method IN ('Cash','UPI','Card','Pending')),
      total_paise INTEGER NOT NULL CHECK(total_paise >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE RESTRICT,
      bill_item_id INTEGER NOT NULL REFERENCES bill_items(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      restock INTEGER NOT NULL CHECK(restock IN (0,1)),
      UNIQUE(return_id, bill_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
    CREATE INDEX IF NOT EXISTS idx_bills_customer ON bills(customer_name);
    CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
    CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);
    CREATE INDEX IF NOT EXISTS idx_bill_items_product_id ON bill_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
    CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
  `);
    // Version tracking
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, datetime('now'))`).run();
    const hasVariantMigration = db.prepare(`SELECT 1 FROM schema_migrations WHERE version=2`).get();
    if (!hasVariantMigration) {
        const migrateVariants = db.transaction(() => {
            const products = db.prepare(`SELECT id, stock FROM products`).all();
            const insertVariant = db.prepare(`
        INSERT OR IGNORE INTO product_variants(product_id, size, color, stock)
        VALUES(?, 'DEFAULT', '', ?)
      `);
            for (const product of products)
                insertVariant.run(product.id, product.stock);
            db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(2, datetime('now'))`).run();
        });
        migrateVariants();
    }
    const hasBillVariantMigration = db.prepare(`SELECT 1 FROM schema_migrations WHERE version=3`).get();
    if (!hasBillVariantMigration) {
        const columns = db.prepare(`PRAGMA table_info(bill_items)`).all();
        if (!columns.some(column => column.name === 'variant_id')) {
            db.exec(`ALTER TABLE bill_items ADD COLUMN variant_id INTEGER REFERENCES product_variants(id)`);
        }
        db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(3, datetime('now'))`).run();
    }
    const hasVariantDetailsMigration = db.prepare(`SELECT 1 FROM schema_migrations WHERE version=4`).get();
    if (!hasVariantDetailsMigration) {
        const columns = db.prepare(`PRAGMA table_info(product_variants)`).all();
        if (!columns.some(column => column.name === 'sku'))
            db.exec(`ALTER TABLE product_variants ADD COLUMN sku TEXT NOT NULL DEFAULT ''`);
        if (!columns.some(column => column.name === 'barcode'))
            db.exec(`ALTER TABLE product_variants ADD COLUMN barcode TEXT NOT NULL DEFAULT ''`);
        if (!columns.some(column => column.name === 'price_paise'))
            db.exec(`ALTER TABLE product_variants ADD COLUMN price_paise INTEGER`);
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_sku ON product_variants(sku) WHERE sku <> ''`);
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_barcode ON product_variants(barcode) WHERE barcode <> ''`);
        db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(4, datetime('now'))`).run();
    }
    const hasCustomerMigration = db.prepare(`SELECT 1 FROM schema_migrations WHERE version=5`).get();
    if (!hasCustomerMigration) {
        const billColumns = db.prepare(`PRAGMA table_info(bills)`).all();
        if (!billColumns.some(column => column.name === 'customer_id')) {
            db.exec(`ALTER TABLE bills ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL`);
        }
        db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON bills(customer_id)`);
        db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(5, datetime('now'))`).run();
    }
    const hasPurchaseMigration = db.prepare(`SELECT 1 FROM schema_migrations WHERE version=6`).get();
    if (!hasPurchaseMigration) {
        db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(6, datetime('now'))`).run();
    }
    const hasReturnMigration = db.prepare(`SELECT 1 FROM schema_migrations WHERE version=7`).get();
    if (!hasReturnMigration) {
        db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(7, datetime('now'))`).run();
    }
    const hasIdempotencyMigration = db.prepare(`SELECT 1 FROM schema_migrations WHERE version=8`).get();
    if (!hasIdempotencyMigration) {
        const billColumns = db.prepare(`PRAGMA table_info(bills)`).all();
        if (!billColumns.some(column => column.name === 'idempotency_key')) {
            db.exec(`ALTER TABLE bills ADD COLUMN idempotency_key TEXT`);
        }
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_idempotency_key ON bills(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''`);
        db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(8, datetime('now'))`).run();
    }
    const hasProductSizeMigration = db.prepare(`SELECT 1 FROM schema_migrations WHERE version=9`).get();
    if (!hasProductSizeMigration) {
        const columns = db.prepare(`PRAGMA table_info(products)`).all();
        if (!columns.some(column => column.name === 'size'))
            db.exec(`ALTER TABLE products ADD COLUMN size TEXT NOT NULL DEFAULT ''`);
        db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(9, datetime('now'))`).run();
    }
    const hasProductAttributesMigration = db.prepare(`SELECT 1 FROM schema_migrations WHERE version=10`).get();
    if (!hasProductAttributesMigration) {
        const columns = new Set(db.prepare(`PRAGMA table_info(products)`).all().map(column => column.name));
        if (!columns.has('category'))
            db.exec(`ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT ''`);
        if (!columns.has('size_scale'))
            db.exec(`ALTER TABLE products ADD COLUMN size_scale TEXT NOT NULL DEFAULT 'None'`);
        if (!columns.has('size_options'))
            db.exec(`ALTER TABLE products ADD COLUMN size_options TEXT NOT NULL DEFAULT ''`);
        db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(10, datetime('now'))`).run();
    }
    const hasCustomerSourceMigration = db.prepare(`SELECT 1 FROM schema_migrations WHERE version=11`).get();
    if (!hasCustomerSourceMigration) {
        const columns = new Set(db.prepare(`PRAGMA table_info(customers)`).all().map(column => column.name));
        if (!columns.has('source'))
            db.exec(`ALTER TABLE customers ADD COLUMN source TEXT NOT NULL DEFAULT 'Walk-in'`);
        db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(11, datetime('now'))`).run();
    }
    // Invoice sequence seed
    db.prepare(`INSERT OR IGNORE INTO invoice_sequences(prefix, current_value) VALUES('MC', 999)`).run();
    // Default settings
    const defaultSettings = [
        ['shop_name', 'Montreux Clothing'],
        ['owner_name', ''],
        ['shop_phone', ''],
        ['shop_gst', ''],
        ['shop_address', ''],
        ['invoice_footer', 'Thank you for shopping at Montreux Clothing!'],
        ['gst_rate_percent', '18.0'],
        ['tax_confirmed', '0'],
    ];
    const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)`);
    for (const [k, v] of defaultSettings)
        insertSetting.run(k, v);
    // Seed product catalog if empty
    const count = db.prepare(`SELECT COUNT(*) AS c FROM products`).get().c;
    if (count === 0) {
        const ins = db.prepare(`INSERT INTO products(name, price_paise, stock, threshold) VALUES(?, ?, ?, ?)`);
        const seed = [
            ['Shirt - ₹350', 35000, 50, 10],
            ['Shirt - ₹500', 50000, 40, 10],
            ['Shirt - ₹600', 60000, 35, 10],
            ['Pant - ₹550', 55000, 45, 10],
            ['Pant - ₹650', 65000, 30, 10],
            ['Pant - ₹750', 75000, 25, 10],
            ['T-Shirt - ₹390', 39000, 60, 10],
            ['Track Pants - ₹290', 29000, 40, 10],
            ['Track Pants - ₹390', 39000, 35, 10],
            ['Half Shorts - ₹290', 29000, 55, 10],
        ];
        const insertMany = db.transaction(() => { for (const row of seed)
            ins.run(...row); });
        insertMany();
    }
    db.prepare(`
    INSERT OR IGNORE INTO product_variants(product_id, size, color, stock)
    SELECT id, 'DEFAULT', '', stock FROM products
  `).run();
}
// ─────────────────────────────────────────────
// Product Queries
// ─────────────────────────────────────────────
function getProducts(db) {
    const rows = db.prepare(`
    SELECT id, name, size, category, size_scale, size_options, price_paise, stock, threshold, is_active
    FROM products
    ORDER BY is_active DESC, name COLLATE NOCASE
  `).all();
    const variants = db.prepare(`
    SELECT id, product_id, size, color, sku, barcode, price_paise, stock
    FROM product_variants ORDER BY product_id, size, color
  `).all();
    const byProduct = new Map();
    for (const variant of variants) {
        const list = byProduct.get(variant.product_id) ?? [];
        list.push(variant);
        byProduct.set(variant.product_id, list);
    }
    return rows.map(r => ({ ...r, is_active: r.is_active === 1, variants: byProduct.get(r.id) ?? [] }));
}
function getCustomers(db, search = '') {
    const term = search.trim();
    const where = term ? `AND (c.name LIKE @term OR c.phone LIKE @term OR c.email LIKE @term)` : '';
    return db.prepare(`
    SELECT c.id, c.name, c.phone, c.email, c.notes, c.source, c.is_active, c.created_at, c.updated_at,
           COUNT(CASE WHEN b.status='COMPLETED' THEN 1 END) AS purchase_count,
           COALESCE(SUM(CASE WHEN b.status='COMPLETED' THEN b.grand_total_paise ELSE 0 END), 0) AS purchase_total_paise
    FROM customers c
    LEFT JOIN bills b ON b.customer_id=c.id
    WHERE c.is_active=1 ${where}
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE
    LIMIT 500
  `).all(term ? { term: `%${term}%` } : {});
}
function saveCustomer(db, customer) {
    const name = customer.name.trim();
    const phone = customer.phone.trim();
    const email = customer.email.trim();
    const notes = customer.notes.trim();
    const source = customer.source?.trim() || 'Walk-in';
    if (!name)
        throw new Error('Customer name cannot be empty.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error('Customer email is invalid.');
    if (customer.id) {
        const result = db.prepare(`
      UPDATE customers SET name=?, phone=?, email=?, notes=?, source=?, updated_at=datetime('now')
      WHERE id=? AND is_active=1
    `).run(name, phone, email, notes, source, customer.id);
        if (result.changes !== 1)
            throw new Error('Customer to update was not found.');
    }
    else {
        const result = db.prepare(`
      INSERT INTO customers(name, phone, email, notes, source) VALUES(?, ?, ?, ?, ?)
    `).run(name, phone, email, notes, source);
        customer = { ...customer, id: Number(result.lastInsertRowid) };
    }
    return getCustomers(db).find(row => row.id === customer.id);
}
function archiveCustomer(db, customerId) {
    const result = db.prepare(`UPDATE customers SET is_active=0, updated_at=datetime('now') WHERE id=? AND is_active=1`)
        .run(customerId);
    if (result.changes !== 1)
        throw new Error('Customer to archive was not found.');
    db.prepare(`
    INSERT INTO audit_logs(entity_type, entity_id, action, payload)
    VALUES('CUSTOMER', ?, 'ARCHIVE', ?)
  `).run(String(customerId), JSON.stringify({ customer_id: customerId }));
}
function getSuppliers(db, search = '') {
    const term = search.trim();
    const query = term
        ? `SELECT id, name, phone, email, address, is_active FROM suppliers WHERE is_active=1
       AND (name LIKE @term OR phone LIKE @term OR email LIKE @term) ORDER BY name COLLATE NOCASE LIMIT 500`
        : `SELECT id, name, phone, email, address, is_active FROM suppliers WHERE is_active=1 ORDER BY name COLLATE NOCASE LIMIT 500`;
    return db.prepare(query).all(term ? { term: `%${term}%` } : {}).map((row) => ({
        ...row, is_active: row.is_active === 1,
    }));
}
function saveSupplier(db, supplier) {
    const name = supplier.name.trim();
    if (!name)
        throw new Error('Supplier name cannot be empty.');
    if (supplier.id) {
        const result = db.prepare(`
      UPDATE suppliers SET name=?, phone=?, email=?, address=?, updated_at=datetime('now')
      WHERE id=? AND is_active=1
    `).run(name, supplier.phone.trim(), supplier.email.trim(), supplier.address.trim(), supplier.id);
        if (result.changes !== 1)
            throw new Error('Supplier to update was not found.');
    }
    else {
        const result = db.prepare(`
      INSERT INTO suppliers(name, phone, email, address) VALUES(?, ?, ?, ?)
    `).run(name, supplier.phone.trim(), supplier.email.trim(), supplier.address.trim());
        supplier = { ...supplier, id: Number(result.lastInsertRowid) };
    }
    const saved = getSuppliers(db).find(row => row.id === supplier.id);
    if (!saved)
        throw new Error('Supplier could not be loaded after saving.');
    return saved;
}
function getPurchases(db) {
    return db.prepare(`
    SELECT p.id, p.receipt_no, p.supplier_id, s.name AS supplier_name, p.received_at,
           p.total_paise, p.status, COUNT(pi.id) AS items_count
    FROM purchases p JOIN suppliers s ON s.id=p.supplier_id
    LEFT JOIN purchase_items pi ON pi.purchase_id=p.id
    GROUP BY p.id ORDER BY p.id DESC LIMIT 500
  `).all();
}
function getStockMovements(db) {
    return db.prepare(`
    SELECT sm.id, sm.variant_id, sm.product_id, p.name AS product_name,
           CASE WHEN v.id IS NULL THEN '' ELSE v.size || CASE WHEN v.color='' THEN '' ELSE ' / ' || v.color END END AS variant_label,
           sm.movement_type, sm.quantity, sm.reference_type, sm.reference_id, sm.reason, sm.created_at
    FROM stock_movements sm
    JOIN products p ON p.id=sm.product_id
    LEFT JOIN product_variants v ON v.id=sm.variant_id
    ORDER BY sm.id DESC LIMIT 500
  `).all();
}
function createPurchase(db, purchase) {
    const receiptNo = purchase.receipt_no.trim();
    if (!receiptNo)
        throw new Error('Receipt number is required.');
    if (!Number.isInteger(purchase.supplier_id))
        throw new Error('Supplier is required.');
    if (!purchase.items.length)
        throw new Error('At least one purchase line is required.');
    let purchaseId = 0;
    const receive = db.transaction(() => {
        if (!db.prepare(`SELECT id FROM suppliers WHERE id=? AND is_active=1`).get(purchase.supplier_id)) {
            throw new Error('Supplier was not found.');
        }
        let total = 0;
        for (const item of purchase.items) {
            if (!Number.isInteger(item.variant_id) || !Number.isInteger(item.quantity) || item.quantity <= 0) {
                throw new Error('Purchase quantity must be a positive whole number.');
            }
            if (!Number.isInteger(item.unit_cost_paise) || item.unit_cost_paise < 0) {
                throw new Error('Purchase cost must be a non-negative integer number of paise.');
            }
            if (!db.prepare(`SELECT id FROM product_variants WHERE id=?`).get(item.variant_id)) {
                throw new Error(`Variant ${item.variant_id} was not found.`);
            }
            total += item.quantity * item.unit_cost_paise;
        }
        try {
            const result = db.prepare(`
        INSERT INTO purchases(receipt_no, supplier_id, received_at, notes, total_paise)
        VALUES(?, ?, ?, ?, ?)
      `).run(receiptNo, purchase.supplier_id, purchase.received_at, purchase.notes.trim(), total);
            purchaseId = Number(result.lastInsertRowid);
        }
        catch (error) {
            if (error instanceof Error && /UNIQUE/i.test(error.message))
                throw new Error('Receipt number already exists.');
            throw error;
        }
        const insertItem = db.prepare(`
      INSERT INTO purchase_items(purchase_id, variant_id, quantity, unit_cost_paise, total_paise)
      VALUES(?, ?, ?, ?, ?)
    `);
        for (const item of purchase.items) {
            const variant = db.prepare(`SELECT product_id FROM product_variants WHERE id=?`).get(item.variant_id);
            insertItem.run(purchaseId, item.variant_id, item.quantity, item.unit_cost_paise, item.quantity * item.unit_cost_paise);
            db.prepare(`UPDATE product_variants SET stock=stock+?, updated_at=datetime('now') WHERE id=?`)
                .run(item.quantity, item.variant_id);
            db.prepare(`UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=?), updated_at=datetime('now') WHERE id=?`)
                .run(variant.product_id, variant.product_id);
            db.prepare(`
        INSERT INTO stock_movements(variant_id, product_id, movement_type, quantity, reference_type, reference_id, reason)
        VALUES(?, ?, 'PURCHASE_RECEIPT', ?, 'PURCHASE', ?, ?)
      `).run(item.variant_id, variant.product_id, item.quantity, String(purchaseId), purchase.notes.trim());
        }
        db.prepare(`
      INSERT INTO audit_logs(entity_type, entity_id, action, payload)
      VALUES('PURCHASE', ?, 'RECEIVE', ?)
    `).run(String(purchaseId), JSON.stringify({ receipt_no: receiptNo, total_paise: total }));
        return purchaseId;
    })();
    return getPurchases(db).find(row => row.id === purchaseId);
}
function getReturns(db) {
    return db.prepare(`
    SELECT r.id, r.bill_id, b.bill_no, r.reason, r.refund_method, r.total_paise, r.created_at
    FROM returns r JOIN bills b ON b.id=r.bill_id ORDER BY r.id DESC LIMIT 500
  `).all();
}
function createReturn(db, request) {
    if (!request.reason.trim())
        throw new Error('A return reason is required.');
    if (!['Cash', 'UPI', 'Card', 'Pending'].includes(request.refund_method))
        throw new Error('Unsupported refund method.');
    if (!request.items.length)
        throw new Error('At least one returned item is required.');
    let returnId = 0;
    const execute = db.transaction(() => {
        const bill = db.prepare(`SELECT bill_no, status FROM bills WHERE id=?`).get(request.bill_id);
        if (!bill)
            throw new Error('Original invoice was not found.');
        if (bill.status !== 'COMPLETED' && bill.status !== 'REFUNDED')
            throw new Error('Only completed invoices can be returned.');
        let total = 0;
        for (const item of request.items) {
            if (!Number.isInteger(item.quantity) || item.quantity <= 0)
                throw new Error('Return quantity must be a positive whole number.');
            const line = db.prepare(`SELECT id, quantity, price_paise FROM bill_items WHERE id=? AND bill_id=?`)
                .get(item.bill_item_id, request.bill_id);
            if (!line)
                throw new Error(`Bill item ${item.bill_item_id} was not found on the invoice.`);
            const prior = db.prepare(`SELECT COALESCE(SUM(ri.quantity),0) AS quantity FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.bill_item_id=?`).get(line.id).quantity;
            if (prior + item.quantity > line.quantity)
                throw new Error(`Return quantity exceeds the eligible quantity for bill item ${line.id}.`);
            total += line.price_paise * item.quantity;
        }
        returnId = Number(db.prepare(`INSERT INTO returns(bill_id, reason, refund_method, total_paise) VALUES(?, ?, ?, ?)`)
            .run(request.bill_id, request.reason.trim(), request.refund_method, total).lastInsertRowid);
        for (const item of request.items) {
            const line = db.prepare(`SELECT product_id, variant_id FROM bill_items WHERE id=?`).get(item.bill_item_id);
            db.prepare(`INSERT INTO return_items(return_id, bill_item_id, quantity, restock) VALUES(?, ?, ?, ?)`)
                .run(returnId, item.bill_item_id, item.quantity, item.restock ? 1 : 0);
            if (item.restock && line.variant_id) {
                db.prepare(`UPDATE product_variants SET stock=stock+?, updated_at=datetime('now') WHERE id=?`).run(item.quantity, line.variant_id);
                db.prepare(`UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=?), updated_at=datetime('now') WHERE id=?`).run(line.product_id, line.product_id);
                db.prepare(`INSERT INTO stock_movements(variant_id, product_id, movement_type, quantity, reference_type, reference_id, reason) VALUES(?, ?, 'RETURN_RESTOCK', ?, 'RETURN', ?, ?)`)
                    .run(line.variant_id, line.product_id, item.quantity, String(returnId), request.reason.trim());
            }
        }
        const eligible = db.prepare(`
      SELECT COUNT(*) AS remaining FROM bill_items bi
      WHERE bi.bill_id=? AND bi.quantity > (SELECT COALESCE(SUM(ri.quantity),0) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.bill_item_id=bi.id)
    `).get(request.bill_id);
        if (eligible.remaining === 0)
            db.prepare(`UPDATE bills SET status='REFUNDED', updated_at=datetime('now') WHERE id=?`).run(request.bill_id);
        db.prepare(`INSERT INTO audit_logs(entity_type, entity_id, action, payload) VALUES('RETURN', ?, 'REFUND', ?)`)
            .run(String(returnId), JSON.stringify({ bill_id: request.bill_id, total_paise: total, reason: request.reason.trim() }));
    })();
    return getReturns(db).find(row => row.id === returnId);
}
function saveVariant(db, variant) {
    if (!Number.isInteger(variant.product_id) || !Number.isInteger(variant.stock) || variant.stock < 0) {
        throw new Error('Variant product and non-negative whole-number stock are required.');
    }
    if (!variant.size.trim())
        throw new Error('Variant size is required.');
    if (!variant.sku.trim() && !variant.barcode.trim())
        throw new Error('Variant SKU or barcode is required.');
    if (variant.price_paise != null && (!Number.isInteger(variant.price_paise) || variant.price_paise < 0)) {
        throw new Error('Variant price must be a non-negative integer number of paise.');
    }
    if (!db.prepare(`SELECT id FROM products WHERE id=?`).get(variant.product_id))
        throw new Error('Parent product was not found.');
    const previous = variant.id
        ? db.prepare(`SELECT stock FROM product_variants WHERE id=? AND product_id=?`).get(variant.id, variant.product_id)
        : undefined;
    if (variant.id && !previous)
        throw new Error('Variant to update was not found.');
    if (previous && previous.stock !== variant.stock && !variant.stock_adjustment_reason?.trim()) {
        throw new Error('A reason is required when changing variant stock.');
    }
    const duplicateSize = db.prepare(`SELECT id FROM product_variants WHERE product_id=? AND size=? AND id<>?`)
        .get(variant.product_id, variant.size.trim(), variant.id ?? 0);
    if (duplicateSize)
        throw new Error('A variant with this size already exists for the product.');
    try {
        if (variant.id) {
            const result = db.prepare(`
        UPDATE product_variants SET size=?, color=?, sku=?, barcode=?, price_paise=?, stock=?, updated_at=datetime('now')
        WHERE id=? AND product_id=?
      `).run(variant.size.trim(), variant.color.trim(), variant.sku.trim(), variant.barcode.trim(), variant.price_paise ?? null, variant.stock, variant.id, variant.product_id);
            if (result.changes !== 1)
                throw new Error('Variant to update was not found.');
        }
        else {
            const result = db.prepare(`
        INSERT INTO product_variants(product_id, size, color, sku, barcode, price_paise, stock)
        VALUES(?, ?, ?, ?, ?, ?, ?)
      `).run(variant.product_id, variant.size.trim(), variant.color.trim(), variant.sku.trim(), variant.barcode.trim(), variant.price_paise ?? null, variant.stock);
            variant = { ...variant, id: Number(result.lastInsertRowid) };
        }
        if (previous && previous.stock !== variant.stock) {
            db.prepare(`
        INSERT INTO stock_movements(variant_id, product_id, movement_type, quantity, reference_type, reference_id, reason)
        VALUES(?, ?, 'MANUAL_ADJUSTMENT', ?, 'VARIANT', ?, ?)
      `).run(variant.id, variant.product_id, variant.stock - previous.stock, String(variant.id), variant.stock_adjustment_reason.trim());
            db.prepare(`
        INSERT INTO audit_logs(entity_type, entity_id, action, payload)
        VALUES('VARIANT', ?, 'STOCK_ADJUST', ?)
      `).run(String(variant.id), JSON.stringify({ old_stock: previous.stock, new_stock: variant.stock, reason: variant.stock_adjustment_reason.trim() }));
        }
    }
    catch (error) {
        if (error instanceof Error && /UNIQUE|constraint/i.test(error.message))
            throw new Error('Variant SKU/barcode must be unique.');
        throw error;
    }
    db.prepare(`UPDATE products SET stock=(SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id=?), updated_at=datetime('now') WHERE id=?`)
        .run(variant.product_id, variant.product_id);
    return db.prepare(`SELECT id, product_id, size, color, sku, barcode, price_paise, stock FROM product_variants WHERE id=?`)
        .get(variant.id);
}
function deleteVariant(db, variantId) {
    const used = db.prepare(`SELECT COUNT(*) AS count FROM bill_items WHERE variant_id=?`).get(variantId);
    if (used.count > 0)
        throw new Error('Sold variants cannot be deleted; adjust their stock to zero instead.');
    const variant = db.prepare(`SELECT product_id FROM product_variants WHERE id=?`).get(variantId);
    if (!variant)
        throw new Error('Variant was not found.');
    db.prepare(`DELETE FROM product_variants WHERE id=?`).run(variantId);
    db.prepare(`UPDATE products SET stock=(SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id=?), updated_at=datetime('now') WHERE id=?`)
        .run(variant.product_id, variant.product_id);
}
function saveProduct(db, product) {
    if (!product.name.trim())
        throw new Error('Product name cannot be empty.');
    if (product.price_paise < 0)
        throw new Error('Price cannot be negative.');
    if (product.stock < 0)
        throw new Error('Stock cannot be negative.');
    if (product.threshold < 0)
        throw new Error('Threshold cannot be negative.');
    if (product.id) {
        const variantCount = db.prepare(`SELECT COUNT(*) AS count FROM product_variants WHERE product_id=?`)
            .get(product.id);
        const storedStock = variantCount.count > 0
            ? db.prepare(`SELECT COALESCE(SUM(stock), 0) AS stock FROM product_variants WHERE product_id=?`)
                .get(product.id).stock
            : product.stock;
        const info = db.prepare(`
      UPDATE products SET name=?, size=?, category=?, size_scale=?, size_options=?, price_paise=?, stock=?, threshold=?, updated_at=datetime('now')
      WHERE id=?
    `).run(product.name.trim(), product.size.trim(), product.category.trim(), product.size_scale.trim() || 'None', product.size_options.trim(), product.price_paise, storedStock, product.threshold, product.id);
        if (info.changes === 0)
            throw new Error('Product to update was not found.');
    }
    else {
        const sizes = [...new Set((product.selected_sizes ?? []).map(size => size.trim()).filter(Boolean))];
        const selectedSizes = sizes.length ? sizes : ['No size'];
        const stocks = product.size_stocks ?? {};
        for (const selectedSize of selectedSizes) {
            const quantity = stocks[selectedSize] ?? product.stock;
            if (!Number.isInteger(quantity) || quantity < 0)
                throw new Error(`Stock for ${selectedSize} must be a non-negative whole number.`);
        }
        const totalStock = selectedSizes.reduce((sum, selectedSize) => sum + (stocks[selectedSize] ?? product.stock), 0);
        const createProduct = db.transaction(() => {
            const result = db.prepare(`
      INSERT INTO products(name, size, category, size_scale, size_options, price_paise, stock, threshold, is_active) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(product.name.trim(), product.size.trim(), product.category.trim(), product.size_scale.trim() || 'None', product.size_options.trim(), product.price_paise, totalStock, product.threshold);
            const productId = Number(result.lastInsertRowid);
            const insertVariant = db.prepare(`
      INSERT INTO product_variants(product_id, size, color, sku, barcode, price_paise, stock)
      VALUES(?, ?, '', ?, '', NULL, ?)
    `);
            for (const selectedSize of selectedSizes) {
                insertVariant.run(productId, selectedSize, `PRODUCT-${productId}-${selectedSize.replace(/[^A-Za-z0-9]+/g, '-')}`, stocks[selectedSize] ?? product.stock);
            }
        });
        createProduct();
    }
}
function adjustStock(db, productId, delta, reason) {
    const doAdjust = db.transaction(() => {
        const row = db.prepare(`SELECT stock, name FROM products WHERE id=?`).get(productId);
        if (!row)
            throw new Error(`Product ${productId} not found.`);
        const variantCount = db.prepare(`SELECT COUNT(*) AS count FROM product_variants WHERE product_id=?`).get(productId).count;
        if (variantCount > 0) {
            throw new Error('Adjust stock on the exact size/colour variant instead of the product total.');
        }
        const newStock = row.stock + delta;
        if (newStock < 0)
            throw new Error(`Cannot deduct ${-delta}: only ${row.stock} in stock for "${row.name}".`);
        db.prepare(`UPDATE products SET stock=?, updated_at=datetime('now') WHERE id=?`).run(newStock, productId);
        db.prepare(`
      INSERT INTO stock_movements(product_id, movement_type, quantity, reference_type, reference_id, reason)
      VALUES(?, 'MANUAL_ADJUSTMENT', ?, 'PRODUCT', ?, ?)
    `).run(productId, delta, String(productId), reason.trim());
        db.prepare(`
      INSERT INTO audit_logs(entity_type, entity_id, action, payload) VALUES('PRODUCT', ?, 'STOCK_ADJUST', ?)
    `).run(String(productId), JSON.stringify({
            product_id: productId, product_name: row.name,
            old_stock: row.stock, delta, new_stock: newStock, reason: reason.trim(),
        }));
    });
    doAdjust();
}
function deleteProduct(db, productId) {
    const refCount = db.prepare(`SELECT COUNT(*) AS c FROM bill_items WHERE product_id=?`).get(productId).c;
    if (refCount > 0) {
        db.prepare(`UPDATE products SET is_active=0, updated_at=datetime('now') WHERE id=?`).run(productId);
    }
    else {
        db.prepare(`DELETE FROM products WHERE id=?`).run(productId);
    }
}
// ─────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────
function getDashboardStats(db) {
    const today = new Date().toISOString().slice(0, 10);
    const total_revenue_paise = db.prepare(`SELECT COALESCE(SUM(grand_total_paise), 0) AS v FROM bills WHERE status='COMPLETED'`).get().v;
    const total_bills = db.prepare(`SELECT COUNT(*) AS v FROM bills WHERE status='COMPLETED'`).get().v;
    const today_sales_paise = db.prepare(`SELECT COALESCE(SUM(grand_total_paise), 0) AS v FROM bills WHERE date=? AND status='COMPLETED'`).get(today).v;
    const items_sold_today = db.prepare(`
    SELECT COALESCE(SUM(bi.quantity), 0) AS v
    FROM bill_items bi JOIN bills b ON bi.bill_id = b.id
    WHERE b.date=? AND b.status='COMPLETED'
  `).get(today).v;
    const recent_bills = db.prepare(`
    SELECT b.id, b.bill_no, b.date, b.customer_name, b.customer_phone, b.payment_method,
           b.subtotal_paise, b.total_discount_paise, b.gst_amount_paise, b.grand_total_paise,
           b.status, COUNT(bi.id) AS items_count, b.created_at, b.idempotency_key
    FROM bills b LEFT JOIN bill_items bi ON b.id = bi.bill_id
    GROUP BY b.id ORDER BY b.id DESC LIMIT 10
  `).all();
    const low_stock_products = db.prepare(`
    SELECT id, name, price_paise, stock, threshold, is_active
    FROM products WHERE is_active=1 AND stock <= threshold ORDER BY stock ASC
  `).all().map(r => ({ ...r, is_active: r.is_active === 1 }));
    return { total_revenue_paise, total_bills, today_sales_paise, items_sold_today, recent_bills, low_stock_products };
}
// ─────────────────────────────────────────────
// Bill History
// ─────────────────────────────────────────────
function getBills(db, filter) {
    let query = `
    SELECT b.id, b.bill_no, b.date, b.customer_name, b.customer_phone, b.payment_method,
           b.subtotal_paise, b.total_discount_paise, b.gst_amount_paise, b.grand_total_paise,
           b.status, COUNT(bi.id) AS items_count, b.created_at, b.idempotency_key
    FROM bills b LEFT JOIN bill_items bi ON b.id = bi.bill_id WHERE 1=1 `;
    const params = [];
    if (filter.search_customer?.trim()) {
        query += `AND b.customer_name LIKE ? `;
        params.push(`%${filter.search_customer.trim()}%`);
    }
    if (filter.search_bill_no?.trim()) {
        query += `AND b.bill_no LIKE ? `;
        params.push(`%${filter.search_bill_no.trim()}%`);
    }
    if (filter.date_from?.trim()) {
        query += `AND b.date >= ? `;
        params.push(filter.date_from.trim());
    }
    if (filter.date_to?.trim()) {
        query += `AND b.date <= ? `;
        params.push(filter.date_to.trim());
    }
    if (filter.status?.trim() && filter.status !== 'ALL') {
        query += `AND b.status = ? `;
        params.push(filter.status.trim());
    }
    query += `GROUP BY b.id ORDER BY b.id DESC LIMIT 500`;
    return db.prepare(query).all(...params);
}
function getBillDetail(db, billId) {
    const bill = db.prepare(`
    SELECT b.id, b.bill_no, b.date, b.customer_name, b.customer_phone, b.payment_method,
           b.subtotal_paise, b.total_discount_paise, b.gst_amount_paise, b.grand_total_paise,
           b.status, (SELECT COUNT(*) FROM bill_items WHERE bill_id=b.id) AS items_count, b.created_at, b.idempotency_key
    FROM bills b WHERE b.id=?
  `).get(billId);
    if (!bill)
        throw new Error(`Bill ${billId} not found.`);
    const items = db.prepare(`
    SELECT id, bill_id, product_id, product_name_snapshot, size, price_paise, quantity, total_paise, variant_id
    FROM bill_items WHERE bill_id=? ORDER BY id ASC
  `).all(billId);
    return { bill, items };
}
// ─────────────────────────────────────────────
// ACID Sale Transaction (ports sales.rs create_sale)
// ─────────────────────────────────────────────
function createSale(db, sale) {
    // Pre-transaction validation
    if (!sale.customer_name.trim())
        throw new Error('Customer name is required.');
    if (!['Cash', 'UPI', 'Card', 'Pending'].includes(sale.payment_method))
        throw new Error('Unsupported payment method.');
    if (!sale.items.length)
        throw new Error('At least one line item is required.');
    const idempotencyKey = sale.idempotency_key?.trim();
    if (idempotencyKey) {
        const existing = db.prepare(`SELECT id, bill_no, grand_total_paise FROM bills WHERE idempotency_key=?`).get(idempotencyKey);
        if (existing)
            return { id: existing.id, bill_no: existing.bill_no, total_paise: existing.grand_total_paise };
    }
    if (sale.customer_id != null) {
        if (!Number.isInteger(sale.customer_id))
            throw new Error('Customer id is invalid.');
        if (!db.prepare(`SELECT id FROM customers WHERE id=? AND is_active=1`).get(sale.customer_id)) {
            throw new Error('Selected customer was not found.');
        }
    }
    if (!isFinite(sale.discount_percent) || sale.discount_percent < 0 || sale.discount_percent > 100)
        throw new Error('Discount percentage must be between 0 and 100.');
    if (!Number.isSafeInteger(sale.discount_flat_paise) || sale.discount_flat_paise < 0)
        throw new Error('Flat discount must be a non-negative integer number of paise.');
    const doSale = db.transaction(() => {
        let customerId = sale.customer_id ?? null;
        if (!customerId && sale.save_customer !== false) {
            const source = sale.customer_source?.trim() || 'Walk-in';
            const existing = sale.customer_phone.trim()
                ? db.prepare(`SELECT id FROM customers WHERE is_active=1 AND phone=? ORDER BY id LIMIT 1`).get(sale.customer_phone.trim())
                : undefined;
            if (existing) {
                customerId = existing.id;
            }
            else {
                const result = db.prepare(`INSERT INTO customers(name, phone, email, notes, source) VALUES(?, ?, '', '', ?)`)
                    .run(sale.customer_name.trim(), sale.customer_phone.trim(), source);
                customerId = Number(result.lastInsertRowid);
            }
        }
        // Step 1: Aggregate quantities per product for cumulative stock check
        const requested = new Map();
        const requestedFallback = new Map();
        const requestedVariants = new Map();
        const itemVariants = new Map();
        sale.items.forEach((item, itemIndex) => {
            if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0)
                throw new Error('Every item quantity must be a positive whole number.');
            if (!item.size.trim())
                throw new Error('Size is required for each item.');
            requested.set(item.product_id, (requested.get(item.product_id) ?? 0) + item.quantity);
            const variant = db.prepare(`
        SELECT id, stock FROM product_variants
        WHERE id=? AND product_id=?
      `).get(item.variant_id, item.product_id);
            if (!variant)
                throw new Error(`Variant ${item.variant_id} was not found for product ${item.product_id}.`);
            if (variant.stock < item.quantity) {
                throw new Error(`Insufficient stock for variant ${item.variant_id}: requested ${item.quantity}, available ${variant.stock}.`);
            }
            if (variant) {
                itemVariants.set(itemIndex, variant.id);
                requestedVariants.set(variant.id, (requestedVariants.get(variant.id) ?? 0) + item.quantity);
            }
        });
        // Step 2: Validate stock and load catalog (inside transaction for consistency)
        const catalog = new Map();
        for (const [productId, qty] of requested) {
            const row = db.prepare(`SELECT name, price_paise, stock FROM products WHERE id=? AND is_active=1`).get(productId);
            if (!row)
                throw new Error(`Product ${productId} not found or inactive.`);
            if ((requestedFallback.get(productId) ?? 0) > row.stock)
                throw new Error(`Insufficient stock for "${row.name}": requested ${qty}, available ${row.stock}.`);
            catalog.set(productId, { name: row.name, price: row.price_paise, stock: row.stock });
        }
        // Step 3: Compute totals in integer paise
        let subtotal = 0;
        const lines = [];
        for (const item of sale.items) {
            const cat = catalog.get(item.product_id);
            const variant = db.prepare(`SELECT price_paise FROM product_variants WHERE id=?`).get(item.variant_id);
            const unitPrice = variant?.price_paise ?? cat.price;
            const lineTotal = unitPrice * item.quantity;
            subtotal += lineTotal;
            lines.push([item.product_id, cat.name, item.size, unitPrice, item.quantity, lineTotal]);
        }
        const percentDiscount = Math.round(subtotal * (sale.discount_percent / 100));
        const combinedDiscount = percentDiscount + sale.discount_flat_paise;
        const totalDiscount = Math.min(subtotal, combinedDiscount);
        const afterDiscount = subtotal - totalDiscount;
        const gstRateRow = db.prepare(`SELECT value FROM settings WHERE key='gst_rate_percent'`).get();
        const gstRate = parseFloat(gstRateRow?.value ?? '18.0');
        const gstAmount = sale.apply_gst ? Math.round(afterDiscount * (gstRate / 100)) : 0;
        const grandTotal = afterDiscount + gstAmount;
        // Step 4: Safe sequential invoice number
        const seqRow = db.prepare(`SELECT current_value FROM invoice_sequences WHERE prefix='MC'`).get();
        const nextSeq = seqRow.current_value + 1;
        db.prepare(`UPDATE invoice_sequences SET current_value=?, updated_at=datetime('now') WHERE prefix='MC'`).run(nextSeq);
        const billNo = `MC${nextSeq}`;
        // Step 5: Insert master bill record
        const billInfo = db.prepare(`
      INSERT INTO bills(bill_no, idempotency_key, date, customer_id, customer_name, customer_phone, payment_method,
                        subtotal_paise, discount_percent, discount_flat_paise, total_discount_paise,
                        apply_gst, gst_rate_percent, gst_amount_paise, grand_total_paise, status)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
    `).run(billNo, idempotencyKey ?? null, sale.date, customerId, sale.customer_name.trim(), sale.customer_phone.trim(), sale.payment_method, subtotal, sale.discount_percent, sale.discount_flat_paise, totalDiscount, sale.apply_gst ? 1 : 0, gstRate, gstAmount, grandTotal);
        const billId = Number(billInfo.lastInsertRowid);
        // Step 6: Insert bill line item snapshots
        const insertItem = db.prepare(`
      INSERT INTO bill_items(bill_id, product_id, product_name_snapshot, size, price_paise, quantity, total_paise, variant_id)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `);
        for (const [lineIndex, [productId, name, size, price, qty, lineTotal]] of lines.entries()) {
            const variantId = itemVariants.get(lineIndex);
            insertItem.run(billId, productId, name, size, price, qty, lineTotal, variantId ?? null);
        }
        // Step 7: Deduct stock with concurrency guard (WHERE stock >= qty prevents negative stock)
        const updateStock = db.prepare(`
      UPDATE products SET stock = stock - ?, updated_at = datetime('now')
      WHERE id = ? AND stock >= ?
    `);
        for (const [productId, qty] of requestedFallback) {
            const info = updateStock.run(qty, productId, qty);
            if (info.changes !== 1)
                throw new Error(`Stock changed unexpectedly during transaction for product ${productId}; transaction aborted.`);
        }
        for (const [variantId, qty] of requestedVariants) {
            const info = db.prepare(`
        UPDATE product_variants SET stock=stock-?, updated_at=datetime('now')
        WHERE id=? AND stock>=?
      `).run(qty, variantId, qty);
            if (info.changes !== 1) {
                throw new Error(`Variant stock changed unexpectedly for variant ${variantId}; transaction aborted.`);
            }
            db.prepare(`
        UPDATE products SET stock=stock-?, updated_at=datetime('now')
        WHERE id=(SELECT product_id FROM product_variants WHERE id=?) AND stock>=?
      `).run(qty, variantId, qty);
            db.prepare(`
      INSERT INTO stock_movements(variant_id, product_id, movement_type, quantity, reference_type, reference_id, reason)
      SELECT ?, product_id, 'SALE', ?, 'BILL', ?, ''
      FROM product_variants WHERE id=?
      `).run(variantId, -qty, String(billId), variantId);
        }
        // Step 8: Audit log
        db.prepare(`
      INSERT INTO audit_logs(entity_type, entity_id, action, payload)
      VALUES('BILL', ?, 'SALE', ?)
    `).run(String(billId), JSON.stringify({
            bill_no: billNo, customer_name: sale.customer_name.trim(),
            subtotal_paise: subtotal, discount_paise: totalDiscount,
            gst_paise: gstAmount, grand_total_paise: grandTotal,
        }));
        return { id: billId, bill_no: billNo, total_paise: grandTotal };
    });
    return doSale();
}
// ─────────────────────────────────────────────
// Cancel Sale (ports sales.rs cancel_sale)
// ─────────────────────────────────────────────
function cancelSale(db, billId, reason) {
    if (!reason.trim())
        throw new Error('A cancellation reason is required for audit purposes.');
    const doCancel = db.transaction(() => {
        const row = db.prepare(`SELECT status, bill_no FROM bills WHERE id=?`).get(billId);
        if (!row)
            throw new Error(`Bill ${billId} not found.`);
        if (row.status !== 'COMPLETED')
            throw new Error(`Bill ${row.bill_no} cannot be cancelled because its status is already ${row.status}.`);
        db.prepare(`UPDATE bills SET status='CANCELLED', updated_at=datetime('now') WHERE id=?`).run(billId);
        const items = db.prepare(`SELECT product_id, quantity, variant_id FROM bill_items WHERE bill_id=?`).all(billId);
        for (const item of items) {
            if (item.variant_id) {
                db.prepare(`UPDATE product_variants SET stock=stock+?, updated_at=datetime('now') WHERE id=?`)
                    .run(item.quantity, item.variant_id);
                db.prepare(`
          UPDATE products SET stock=stock+?, updated_at=datetime('now')
          WHERE id=(SELECT product_id FROM product_variants WHERE id=?)
        `).run(item.quantity, item.variant_id);
                db.prepare(`
          INSERT INTO stock_movements(variant_id, product_id, movement_type, quantity, reference_type, reference_id, reason)
          SELECT ?, product_id, 'SALE_CANCEL', ?, 'BILL', ?, ?
          FROM product_variants WHERE id=?
        `).run(item.variant_id, item.quantity, String(billId), reason.trim(), item.variant_id);
            }
            else {
                db.prepare(`UPDATE products SET stock = stock + ?, updated_at=datetime('now') WHERE id=?`)
                    .run(item.quantity, item.product_id);
            }
        }
        db.prepare(`
      INSERT INTO audit_logs(entity_type, entity_id, action, payload)
      VALUES('BILL', ?, 'CANCEL', ?)
    `).run(String(billId), JSON.stringify({
            bill_id: billId, bill_no: row.bill_no,
            reason: reason.trim(), cancelled_at: new Date().toISOString(),
        }));
    });
    doCancel();
}
// ─────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────
function getSettings(db) {
    const rows = db.prepare(`SELECT key, value FROM settings`).all();
    const map = {};
    for (const r of rows)
        map[r.key] = r.value;
    return {
        shop_name: map['shop_name'] ?? 'Montreux Clothing',
        owner_name: map['owner_name'] ?? '',
        shop_phone: map['shop_phone'] ?? '',
        shop_gst: map['shop_gst'] ?? '',
        shop_address: map['shop_address'] ?? '',
        invoice_footer: map['invoice_footer'] ?? 'Thank you for shopping at Montreux Clothing!',
        gst_rate_percent: parseFloat(map['gst_rate_percent'] ?? '18.0'),
        tax_confirmed: map['tax_confirmed'] === '1',
    };
}
function saveSettings(db, settings) {
    const upsert = db.prepare(`
    INSERT INTO settings(key, value, updated_at) VALUES(?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `);
    const doSave = db.transaction(() => {
        upsert.run('shop_name', settings.shop_name.trim());
        upsert.run('owner_name', settings.owner_name.trim());
        upsert.run('shop_phone', settings.shop_phone.trim());
        upsert.run('shop_gst', settings.shop_gst.trim());
        upsert.run('shop_address', settings.shop_address.trim());
        upsert.run('invoice_footer', settings.invoice_footer.trim());
        upsert.run('gst_rate_percent', settings.gst_rate_percent.toFixed(2));
        upsert.run('tax_confirmed', settings.tax_confirmed ? '1' : '0');
    });
    doSave();
}
// ─────────────────────────────────────────────
// Backup & Restore
// ─────────────────────────────────────────────
function exportBackup(db) {
    const exportSnapshot = db.transaction(() => {
        const products = getProducts(db);
        const bills = getBills(db, {});
        const bill_items = db.prepare(`
  SELECT id, bill_id, product_id, product_name_snapshot, size, price_paise, quantity, total_paise, variant_id
    FROM bill_items ORDER BY id ASC
  `).all();
        const settingsRows = db.prepare(`SELECT key, value FROM settings`).all();
        const settings = {};
        for (const r of settingsRows)
            settings[r.key] = r.value;
        const seq = db.prepare(`SELECT current_value FROM invoice_sequences WHERE prefix='MC'`).get()?.current_value ?? 999;
        const tableNames = [
            'schema_migrations', 'products', 'product_variants', 'customers', 'suppliers',
            'bills', 'bill_items', 'purchases', 'purchase_items', 'stock_movements',
            'returns', 'return_items', 'settings', 'invoice_sequences', 'audit_logs',
        ];
        const tables = {};
        for (const table of tableNames) {
            tables[table] = db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
        }
        const payload = {
            version: 2,
            exported_at: new Date().toISOString(),
            products, bills, bill_items, settings,
            invoice_sequence: seq, tables,
        };
        return JSON.stringify(payload, null, 2);
    });
    return exportSnapshot();
}
function importBackupLegacy(db, jsonData) {
    let backup;
    try {
        backup = JSON.parse(jsonData);
    }
    catch {
        throw new Error('Invalid backup format: not valid JSON.');
    }
    if (backup.version !== 2)
        throw new Error('Unsupported backup version.');
    if (!Array.isArray(backup.products) || !Array.isArray(backup.bills))
        throw new Error('Invalid backup format: missing products or bills array.');
    const requiredTables = [
        'schema_migrations', 'products', 'product_variants', 'customers', 'suppliers',
        'bills', 'bill_items', 'purchases', 'purchase_items', 'stock_movements',
        'returns', 'return_items', 'settings', 'invoice_sequences', 'audit_logs',
    ];
    if (!backup.tables || requiredTables.some(table => !Array.isArray(backup.tables[table]))) {
        throw new Error('Invalid backup format: complete table snapshot is required.');
    }
    if (db.prepare(`PRAGMA foreign_key_check`).all().length) {
        throw new Error('Target database failed foreign-key integrity check.');
    }
    for (const table of requiredTables) {
        const columns = new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name));
        for (const row of backup.tables[table]) {
            if (!row || typeof row !== 'object' || Object.keys(row).some(column => !columns.has(column))) {
                throw new Error(`Invalid backup format: unexpected column in ${table}.`);
            }
        }
    }
    const doImport = db.transaction(() => {
        // Clear in FK-safe order
        db.prepare(`DELETE FROM bill_items`).run();
        db.prepare(`DELETE FROM bills`).run();
        db.prepare(`DELETE FROM products`).run();
        for (const p of backup.products) {
            db.prepare(`INSERT INTO products(id, name, price_paise, stock, threshold, is_active) VALUES(?, ?, ?, ?, ?, ?)`)
                .run(p.id, p.name, p.price_paise, p.stock, p.threshold, p.is_active ? 1 : 0);
            for (const variant of p.variants ?? []) {
                db.prepare(`
          INSERT INTO product_variants(id, product_id, size, color, sku, barcode, price_paise, stock)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        `).run(variant.id, p.id, variant.size, variant.color, variant.sku ?? '', variant.barcode ?? '', variant.price_paise ?? null, variant.stock);
            }
        }
        for (const b of backup.bills) {
            db.prepare(`
        INSERT INTO bills(id, bill_no, idempotency_key, date, customer_name, customer_phone, payment_method,
                         subtotal_paise, total_discount_paise, gst_amount_paise, grand_total_paise,
                         status, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(b.id, b.bill_no, b.idempotency_key ?? null, b.date, b.customer_name, b.customer_phone, b.payment_method, b.subtotal_paise, b.total_discount_paise, b.gst_amount_paise, b.grand_total_paise, b.status, b.created_at);
        }
        for (const item of backup.bill_items) {
            db.prepare(`
        INSERT INTO bill_items(id, bill_id, product_id, product_name_snapshot, size, price_paise, quantity, total_paise, variant_id)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(item.id, item.bill_id, item.product_id, item.product_name_snapshot, item.size, item.price_paise, item.quantity, item.total_paise, item.variant_id ?? null);
        }
        for (const [k, v] of Object.entries(backup.settings ?? {})) {
            db.prepare(`INSERT INTO settings(key, value, updated_at) VALUES(?, ?, datetime('now'))
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`)
                .run(k, v);
        }
        if (backup.invoice_sequence) {
            db.prepare(`
        INSERT INTO invoice_sequences(prefix, current_value, updated_at) VALUES('MC', ?, datetime('now'))
        ON CONFLICT(prefix) DO UPDATE SET current_value=MAX(excluded.current_value, invoice_sequences.current_value)
      `).run(backup.invoice_sequence);
        }
        db.prepare(`
      INSERT INTO audit_logs(entity_type, entity_id, action, payload)
      VALUES('SYSTEM', 'DATABASE', 'RESTORE', ?)
    `).run(`Restored ${backup.products.length} products, ${backup.bills.length} bills, ${backup.bill_items.length} items`);
    });
    doImport();
    return {
        products_imported: backup.products.length,
        bills_imported: backup.bills.length,
        items_imported: backup.bill_items.length,
    };
}
function importBackup(db, jsonData) {
    let backup;
    try {
        backup = JSON.parse(jsonData);
    }
    catch {
        throw new Error('Invalid backup format: not valid JSON.');
    }
    if (backup.version !== 2)
        throw new Error('Unsupported backup version.');
    const requiredTables = [
        'schema_migrations', 'products', 'product_variants', 'customers', 'suppliers',
        'bills', 'bill_items', 'purchases', 'purchase_items', 'stock_movements',
        'returns', 'return_items', 'settings', 'invoice_sequences', 'audit_logs',
    ];
    if (!backup.tables || requiredTables.some(table => !Array.isArray(backup.tables[table]))) {
        throw new Error('Invalid backup format: complete table snapshot is required.');
    }
    if (db.prepare(`PRAGMA foreign_key_check`).all().length) {
        throw new Error('Target database failed foreign-key integrity check.');
    }
    for (const table of requiredTables) {
        const columns = new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name));
        for (const row of backup.tables[table]) {
            if (!row || typeof row !== 'object' || Object.keys(row).some(column => !columns.has(column))) {
                throw new Error(`Invalid backup format: unexpected column in ${table}.`);
            }
        }
    }
    const clearOrder = ['return_items', 'returns', 'stock_movements', 'purchase_items', 'purchases',
        'bill_items', 'bills', 'product_variants', 'customers', 'suppliers', 'products',
        'settings', 'invoice_sequences', 'audit_logs', 'schema_migrations'];
    const insertOrder = ['schema_migrations', 'products', 'product_variants', 'customers', 'suppliers',
        'bills', 'bill_items', 'purchases', 'purchase_items', 'stock_movements', 'returns',
        'return_items', 'settings', 'invoice_sequences', 'audit_logs'];
    db.transaction(() => {
        for (const table of clearOrder)
            db.prepare(`DELETE FROM "${table}"`).run();
        for (const table of insertOrder) {
            for (const row of backup.tables[table]) {
                const columns = Object.keys(row);
                const placeholders = columns.map(() => '?').join(', ');
                db.prepare(`INSERT INTO "${table}" ("${columns.join('", "')}") VALUES (${placeholders})`)
                    .run(...columns.map(column => row[column]));
            }
        }
    })();
    return {
        products_imported: backup.tables.products.length,
        bills_imported: backup.tables.bills.length,
        items_imported: backup.tables.bill_items.length,
    };
}
// ─────────────────────────────────────────────
// CSV Export (RFC-4180, formula-injection safe)
// ─────────────────────────────────────────────
function exportBillsCsv(db, filter) {
    const bills = getBills(db, filter);
    const headers = 'Bill No,Date,Customer,Phone,Payment,Items Count,Subtotal (₹),Discount (₹),GST (₹),Grand Total (₹),Status\n';
    const rows = bills.map(b => {
        const escapeCell = (v) => {
            // Strip formula-injection prefix chars; wrap in double-quotes
            const safe = v.replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""');
            return `"${safe}"`;
        };
        return [
            b.bill_no, b.date,
            escapeCell(b.customer_name), escapeCell(b.customer_phone),
            b.payment_method, b.items_count,
            (b.subtotal_paise / 100).toFixed(2),
            (b.total_discount_paise / 100).toFixed(2),
            (b.gst_amount_paise / 100).toFixed(2),
            (b.grand_total_paise / 100).toFixed(2),
            b.status,
        ].join(',');
    });
    return headers + rows.join('\n');
}
// Helper to resolve the database path from user data dir
function resolveDbPath(userDataDir) {
    const dbDir = path_1.default.join(userDataDir, 'montreux-billing');
    if (!fs_1.default.existsSync(dbDir))
        fs_1.default.mkdirSync(dbDir, { recursive: true });
    return path_1.default.join(dbDir, 'billing.db');
}
