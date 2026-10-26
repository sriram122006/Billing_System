import { app } from 'electron';
import fs from 'fs';
import {
  initializeDb, openDb, getProducts, saveSupplier, createPurchase, createSale,
  createReturn, exportBackup, getStockMovements, getBills, saveVariant,
} from './database';

const dbPath = process.env.MONTREUX_SMOKE_DB;
if (!dbPath) throw new Error('MONTREUX_SMOKE_DB is required.');

app.whenReady().then(() => {
  initializeDb(dbPath);
  const db = openDb(dbPath);
  const product = getProducts(db)[0];
  const variant = product.variants![0];
  const initialStock = variant.stock;

  const supplier = saveSupplier(db, { name: 'Smoke Supplier', phone: '', email: '', address: '' });
  createPurchase(db, {
    receipt_no: 'SMOKE-RECEIPT', supplier_id: supplier.id, received_at: '2026-10-26', notes: '',
    items: [{ variant_id: variant.id, quantity: 2, unit_cost_paise: 1000 }],
  });
  const purchasedStock = (db.prepare('SELECT stock FROM product_variants WHERE id=?').get(variant.id) as { stock: number }).stock;
  if (purchasedStock !== initialStock + 2) throw new Error('Purchase stock update failed.');
  try {
    saveVariant(db, { ...variant, color: variant.color || 'Default', sku: variant.sku || `SMOKE-${variant.id}`, stock: purchasedStock + 1 });
    throw new Error('Variant stock changed without a reason.');
  } catch (error) {
    if (!(error instanceof Error) || !/reason is required/i.test(error.message)) throw error;
  }
  saveVariant(db, { ...variant, color: variant.color || 'Default', sku: variant.sku || `SMOKE-${variant.id}`, stock: purchasedStock + 1, stock_adjustment_reason: 'Smoke count' });

  const sale = createSale(db, {
    date: '2026-10-26', customer_name: 'Smoke Customer', customer_phone: '', payment_method: 'Cash',
    items: [{ product_id: product.id, variant_id: variant.id, size: variant.size, quantity: 1 }],
    discount_percent: 0, discount_flat_paise: 0, apply_gst: false,
  });
  const retry = createSale(db, {
    date: '2026-10-26', idempotency_key: 'SMOKE-IDEMPOTENCY',
    customer_name: 'Retry Customer', customer_phone: '', payment_method: 'Cash',
    items: [{ product_id: product.id, variant_id: variant.id, size: variant.size, quantity: 1 }],
    discount_percent: 0, discount_flat_paise: 0, apply_gst: false,
  });
  const retryAgain = createSale(db, {
    date: '2026-10-26', idempotency_key: 'SMOKE-IDEMPOTENCY',
    customer_name: 'Retry Customer', customer_phone: '', payment_method: 'Cash',
    items: [{ product_id: product.id, variant_id: variant.id, size: variant.size, quantity: 1 }],
    discount_percent: 0, discount_flat_paise: 0, apply_gst: false,
  });
  if (retry.id !== retryAgain.id || (db.prepare('SELECT COUNT(*) AS count FROM bills WHERE idempotency_key=?').get('SMOKE-IDEMPOTENCY') as { count: number }).count !== 1) {
    throw new Error('Duplicate idempotency retry created another bill.');
  }
  const item = db.prepare('SELECT id FROM bill_items WHERE bill_id=?').get(sale.id) as { id: number };
  if (getBills(db, { search_bill_no: sale.bill_no }).length !== 1) throw new Error('Invoice number search failed.');
  const saleStock = (db.prepare('SELECT stock FROM product_variants WHERE id=?').get(variant.id) as { stock: number }).stock;
  createReturn(db, { bill_id: sale.id, reason: 'Smoke return', refund_method: 'Cash', items: [{ bill_item_id: item.id, quantity: 1, restock: true }] });
  const restoredStock = (db.prepare('SELECT stock FROM product_variants WHERE id=?').get(variant.id) as { stock: number }).stock;
  if (restoredStock !== saleStock + 1) throw new Error('Return stock restoration failed.');
  if (getStockMovements(db).length < 3) throw new Error('Stock movement ledger is incomplete.');
  const backup = JSON.parse(exportBackup(db));
  if (!Array.isArray(backup.products) || !Array.isArray(backup.bills)) throw new Error('Backup payload is invalid.');
  if (backup.bill_items[0]?.variant_id !== variant.id) throw new Error('Backup lost bill variant reference.');
  const migrationVersion = (db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }).version;
  db.close();
  const reopened = openDb(dbPath);
  if (getProducts(reopened).find(p => p.id === product.id)?.variants?.find(v => v.id === variant.id)?.stock !== restoredStock) {
    throw new Error('Database persistence after reopen failed.');
  }
  console.log(JSON.stringify({ migration_version: migrationVersion, sale_id: sale.id, stock: restoredStock }));
  reopened.close();
  for (const suffix of ['', '-shm', '-wal']) { try { fs.unlinkSync(`${dbPath}${suffix}`); } catch {} }
  app.quit();
});
