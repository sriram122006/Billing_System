use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         PRAGMA temp_store = MEMORY;"
    )?;
    Ok(conn)
}

pub fn initialize(path: &Path) -> rusqlite::Result<()> {
    let conn = open(path)?;
    conn.execute_batch(r#"
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
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
        total_discount_paise INTEGER NOT NULL DEFAULT 0 CHECK(total_discount_paise >= 0 AND total_discount_paise <= subtotal_paise),
        apply_gst INTEGER NOT NULL DEFAULT 0 CHECK(apply_gst IN (0,1)),
        gst_rate_percent REAL NOT NULL DEFAULT 18.0 CHECK(gst_rate_percent >= 0 AND gst_rate_percent <= 100),
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

      CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
      CREATE INDEX IF NOT EXISTS idx_bills_customer ON bills(customer_name);
      CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
      CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);
      CREATE INDEX IF NOT EXISTS idx_bill_items_product_id ON bill_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
    "#)?;

    // Record schema version 1
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, datetime('now'))",
        [],
    )?;

    // Initialize invoice sequence MC starting at 999 (so next is MC1000)
    conn.execute(
        "INSERT OR IGNORE INTO invoice_sequences(prefix, current_value) VALUES('MC', 999)",
        [],
    )?;

    // Initialize default shop settings
    let default_settings = [
        ("shop_name", "Montreux Clothing"),
        ("owner_name", ""),
        ("shop_phone", ""),
        ("shop_gst", ""),
        ("shop_address", ""),
        ("invoice_footer", "Thank you for shopping at Montreux Clothing!"),
        ("gst_rate_percent", "18.0"),
        ("tax_confirmed", "0"),
    ];
    for (k, v) in default_settings {
        conn.execute(
            "INSERT OR IGNORE INTO settings(key, value) VALUES(?1, ?2)",
            params![k, v],
        )?;
    }

    // Seed default catalog if empty
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))?;
    if count == 0 {
        let seed = [
            ("Shirt - ₹350", 35000_i64, 50_i64, 10_i64),
            ("Shirt - ₹500", 50000, 40, 10),
            ("Shirt - ₹600", 60000, 35, 10),
            ("Pant - ₹550", 55000, 45, 10),
            ("Pant - ₹650", 65000, 30, 10),
            ("Pant - ₹750", 75000, 25, 10),
            ("T-Shirt - ₹390", 39000, 60, 10),
            ("Track Pants - ₹290", 29000, 40, 10),
            ("Track Pants - ₹390", 39000, 35, 10),
            ("Half Shorts - ₹290", 29000, 55, 10),
        ];
        for (name, price, stock, threshold) in seed {
            conn.execute(
                "INSERT INTO products(name, price_paise, stock, threshold) VALUES(?1, ?2, ?3, ?4)",
                params![name, price, stock, threshold],
            )?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------
// Model Structures
// ---------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: i64,
    pub name: String,
    pub price_paise: i64,
    pub stock: i64,
    pub threshold: i64,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct ProductInput {
    pub id: Option<i64>,
    pub name: String,
    pub price_paise: i64,
    pub stock: i64,
    pub threshold: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillSummary {
    pub id: i64,
    pub bill_no: String,
    pub date: String,
    pub customer_name: String,
    pub customer_phone: String,
    pub payment_method: String,
    pub subtotal_paise: i64,
    pub total_discount_paise: i64,
    pub gst_amount_paise: i64,
    pub grand_total_paise: i64,
    pub status: String,
    pub items_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillItemDetail {
    pub id: i64,
    pub bill_id: i64,
    pub product_id: i64,
    pub product_name_snapshot: String,
    pub size: String,
    pub price_paise: i64,
    pub quantity: i64,
    pub total_paise: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillDetail {
    pub bill: BillSummary,
    pub items: Vec<BillItemDetail>,
}

#[derive(Debug, Deserialize)]
pub struct BillFilter {
    pub search_customer: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_revenue_paise: i64,
    pub total_bills: i64,
    pub today_sales_paise: i64,
    pub items_sold_today: i64,
    pub recent_bills: Vec<BillSummary>,
    pub low_stock_products: Vec<Product>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShopSettings {
    pub shop_name: String,
    pub owner_name: String,
    pub shop_phone: String,
    pub shop_gst: String,
    pub shop_address: String,
    pub invoice_footer: String,
    pub gst_rate_percent: f64,
    pub tax_confirmed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupPayload {
    pub version: i64,
    pub exported_at: String,
    pub products: Vec<Product>,
    pub bills: Vec<BillSummary>,
    pub bill_items: Vec<BillItemDetail>,
    pub settings: HashMap<String, String>,
    pub invoice_sequence: i64,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub products_imported: usize,
    pub bills_imported: usize,
    pub items_imported: usize,
}

// ---------------------------------------------------------
// Inventory Queries & Mutations
// ---------------------------------------------------------

pub fn get_products(path: &Path) -> rusqlite::Result<Vec<Product>> {
    let conn = open(path)?;
    let mut stmt = conn.prepare(
        "SELECT id, name, price_paise, stock, threshold, is_active 
         FROM products 
         ORDER BY is_active DESC, name COLLATE NOCASE"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Product {
            id: row.get(0)?,
            name: row.get(1)?,
            price_paise: row.get(2)?,
            stock: row.get(3)?,
            threshold: row.get(4)?,
            is_active: row.get::<_, i64>(5)? != 0,
        })
    })?;
    rows.collect()
}

pub fn save_product(path: &Path, product: ProductInput) -> Result<(), String> {
    if product.name.trim().is_empty() {
        return Err("Product name cannot be empty.".into());
    }
    if product.price_paise < 0 {
        return Err("Price cannot be negative.".into());
    }
    if product.stock < 0 {
        return Err("Stock cannot be negative.".into());
    }
    if product.threshold < 0 {
        return Err("Threshold cannot be negative.".into());
    }

    let conn = open(path).map_err(|e| e.to_string())?;
    if let Some(id) = product.id {
        let updated = conn.execute(
            "UPDATE products 
             SET name=?1, price_paise=?2, stock=?3, threshold=?4, updated_at=datetime('now') 
             WHERE id=?5",
            params![product.name.trim(), product.price_paise, product.stock, product.threshold, id],
        ).map_err(|e| e.to_string())?;
        if updated == 0 {
            return Err("Product to update was not found.".into());
        }
    } else {
        conn.execute(
            "INSERT INTO products(name, price_paise, stock, threshold, is_active) 
             VALUES(?1, ?2, ?3, ?4, 1)",
            params![product.name.trim(), product.price_paise, product.stock, product.threshold],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn adjust_stock(path: &Path, product_id: i64, delta: i64, reason: String) -> Result<(), String> {
    let mut conn = open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let (current_stock, name): (i64, String) = tx.query_row(
        "SELECT stock, name FROM products WHERE id=?1",
        params![product_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|_| format!("Product {product_id} not found."))?;

    let new_stock = current_stock + delta;
    if new_stock < 0 {
        return Err(format!("Cannot deduct {}: only {} in stock for {}.", -delta, current_stock, name));
    }

    tx.execute(
        "UPDATE products SET stock=?1, updated_at=datetime('now') WHERE id=?2",
        params![new_stock, product_id],
    ).map_err(|e| e.to_string())?;

    let audit_payload = serde_json::json!({
        "product_id": product_id,
        "product_name": name,
        "old_stock": current_stock,
        "delta": delta,
        "new_stock": new_stock,
        "reason": reason.trim(),
    }).to_string();

    tx.execute(
        "INSERT INTO audit_logs(entity_type, entity_id, action, payload) VALUES('PRODUCT', ?1, 'STOCK_ADJUST', ?2)",
        params![product_id.to_string(), audit_payload],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_product(path: &Path, product_id: i64) -> Result<(), String> {
    let conn = open(path).map_err(|e| e.to_string())?;
    // Check if referenced by historical bill items
    let referenced_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM bill_items WHERE product_id=?1",
        params![product_id],
        |r| r.get(0),
    ).unwrap_or(0);

    if referenced_count > 0 {
        // Protect referential integrity: soft delete so historical invoices never fail
        conn.execute(
            "UPDATE products SET is_active=0, updated_at=datetime('now') WHERE id=?1",
            params![product_id],
        ).map_err(|e| e.to_string())?;
    } else {
        // Safe to hard delete since it was never used in any completed sale
        conn.execute(
            "DELETE FROM products WHERE id=?1",
            params![product_id],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------
// Dashboard Queries
// ---------------------------------------------------------

pub fn get_dashboard_stats(path: &Path) -> Result<DashboardStats, String> {
    let conn = open(path).map_err(|e| e.to_string())?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let total_revenue_paise: i64 = conn.query_row(
        "SELECT COALESCE(SUM(grand_total_paise), 0) FROM bills WHERE status='COMPLETED'",
        [],
        |r| r.get(0),
    ).unwrap_or(0);

    let total_bills: i64 = conn.query_row(
        "SELECT COUNT(*) FROM bills WHERE status='COMPLETED'",
        [],
        |r| r.get(0),
    ).unwrap_or(0);

    let today_sales_paise: i64 = conn.query_row(
        "SELECT COALESCE(SUM(grand_total_paise), 0) FROM bills WHERE date=?1 AND status='COMPLETED'",
        params![today],
        |r| r.get(0),
    ).unwrap_or(0);

    let items_sold_today: i64 = conn.query_row(
        "SELECT COALESCE(SUM(bi.quantity), 0) 
         FROM bill_items bi 
         JOIN bills b ON bi.bill_id = b.id 
         WHERE b.date=?1 AND b.status='COMPLETED'",
        params![today],
        |r| r.get(0),
    ).unwrap_or(0);

    // Recent 10 bills
    let mut stmt = conn.prepare(
        "SELECT b.id, b.bill_no, b.date, b.customer_name, b.customer_phone, b.payment_method,
                b.subtotal_paise, b.total_discount_paise, b.gst_amount_paise, b.grand_total_paise,
                b.status, COUNT(bi.id), b.created_at
         FROM bills b
         LEFT JOIN bill_items bi ON b.id = bi.bill_id
         GROUP BY b.id
         ORDER BY b.id DESC
         LIMIT 10"
    ).map_err(|e| e.to_string())?;

    let recent_bills = stmt.query_map([], |r| {
        Ok(BillSummary {
            id: r.get(0)?,
            bill_no: r.get(1)?,
            date: r.get(2)?,
            customer_name: r.get(3)?,
            customer_phone: r.get(4)?,
            payment_method: r.get(5)?,
            subtotal_paise: r.get(6)?,
            total_discount_paise: r.get(7)?,
            gst_amount_paise: r.get(8)?,
            grand_total_paise: r.get(9)?,
            status: r.get(10)?,
            items_count: r.get(11)?,
            created_at: r.get(12)?,
        })
    }).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;

    // Low stock products
    let mut low_stmt = conn.prepare(
        "SELECT id, name, price_paise, stock, threshold, is_active 
         FROM products 
         WHERE is_active=1 AND stock <= threshold 
         ORDER BY stock ASC"
    ).map_err(|e| e.to_string())?;

    let low_stock_products = low_stmt.query_map([], |r| {
        Ok(Product {
            id: r.get(0)?,
            name: r.get(1)?,
            price_paise: r.get(2)?,
            stock: r.get(3)?,
            threshold: r.get(4)?,
            is_active: r.get::<_, i64>(5)? != 0,
        })
    }).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;

    Ok(DashboardStats {
        total_revenue_paise,
        total_bills,
        today_sales_paise,
        items_sold_today,
        recent_bills,
        low_stock_products,
    })
}

// ---------------------------------------------------------
// Bill History & Details Queries
// ---------------------------------------------------------

pub fn get_bills(path: &Path, filter: BillFilter) -> Result<Vec<BillSummary>, String> {
    let conn = open(path).map_err(|e| e.to_string())?;
    let mut query = String::from(
        "SELECT b.id, b.bill_no, b.date, b.customer_name, b.customer_phone, b.payment_method,
                b.subtotal_paise, b.total_discount_paise, b.gst_amount_paise, b.grand_total_paise,
                b.status, COUNT(bi.id), b.created_at
         FROM bills b
         LEFT JOIN bill_items bi ON b.id = bi.bill_id
         WHERE 1=1 "
    );

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref cust) = filter.search_customer {
        let trimmed = cust.trim();
        if !trimmed.is_empty() {
            query.push_str("AND b.customer_name LIKE ? ");
            params_vec.push(Box::new(format!("%{trimmed}%")));
        }
    }
    if let Some(ref from) = filter.date_from {
        let trimmed = from.trim();
        if !trimmed.is_empty() {
            query.push_str("AND b.date >= ? ");
            params_vec.push(Box::new(trimmed.to_string()));
        }
    }
    if let Some(ref to) = filter.date_to {
        let trimmed = to.trim();
        if !trimmed.is_empty() {
            query.push_str("AND b.date <= ? ");
            params_vec.push(Box::new(trimmed.to_string()));
        }
    }
    if let Some(ref st) = filter.status {
        let trimmed = st.trim();
        if !trimmed.is_empty() && trimmed != "ALL" {
            query.push_str("AND b.status = ? ");
            params_vec.push(Box::new(trimmed.to_string()));
        }
    }

    query.push_str("GROUP BY b.id ORDER BY b.id DESC LIMIT 500");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let rows = stmt.query_map(params_slice.as_slice(), |r| {
        Ok(BillSummary {
            id: r.get(0)?,
            bill_no: r.get(1)?,
            date: r.get(2)?,
            customer_name: r.get(3)?,
            customer_phone: r.get(4)?,
            payment_method: r.get(5)?,
            subtotal_paise: r.get(6)?,
            total_discount_paise: r.get(7)?,
            gst_amount_paise: r.get(8)?,
            grand_total_paise: r.get(9)?,
            status: r.get(10)?,
            items_count: r.get(11)?,
            created_at: r.get(12)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn get_bill_detail(path: &Path, bill_id: i64) -> Result<BillDetail, String> {
    let conn = open(path).map_err(|e| e.to_string())?;

    let bill: BillSummary = conn.query_row(
        "SELECT b.id, b.bill_no, b.date, b.customer_name, b.customer_phone, b.payment_method,
                b.subtotal_paise, b.total_discount_paise, b.gst_amount_paise, b.grand_total_paise,
                b.status, (SELECT COUNT(*) FROM bill_items WHERE bill_id=b.id), b.created_at
         FROM bills b WHERE b.id=?1",
        params![bill_id],
        |r| {
            Ok(BillSummary {
                id: r.get(0)?,
                bill_no: r.get(1)?,
                date: r.get(2)?,
                customer_name: r.get(3)?,
                customer_phone: r.get(4)?,
                payment_method: r.get(5)?,
                subtotal_paise: r.get(6)?,
                total_discount_paise: r.get(7)?,
                gst_amount_paise: r.get(8)?,
                grand_total_paise: r.get(9)?,
                status: r.get(10)?,
                items_count: r.get(11)?,
                created_at: r.get(12)?,
            })
        },
    ).map_err(|_| format!("Bill {bill_id} not found."))?;

    let mut stmt = conn.prepare(
        "SELECT id, bill_id, product_id, product_name_snapshot, size, price_paise, quantity, total_paise
         FROM bill_items WHERE bill_id=?1 ORDER BY id ASC"
    ).map_err(|e| e.to_string())?;

    let items = stmt.query_map(params![bill_id], |r| {
        Ok(BillItemDetail {
            id: r.get(0)?,
            bill_id: r.get(1)?,
            product_id: r.get(2)?,
            product_name_snapshot: r.get(3)?,
            size: r.get(4)?,
            price_paise: r.get(5)?,
            quantity: r.get(6)?,
            total_paise: r.get(7)?,
        })
    }).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;

    Ok(BillDetail { bill, items })
}

// ---------------------------------------------------------
// Settings Management
// ---------------------------------------------------------

pub fn get_settings(path: &Path) -> Result<ShopSettings, String> {
    let conn = open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
    let map: HashMap<String, String> = stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?))
    }).map_err(|e| e.to_string())?
      .collect::<rusqlite::Result<HashMap<_, _>>>()
      .map_err(|e| e.to_string())?;

    let gst_rate_percent = map.get("gst_rate_percent")
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(18.0);
    let tax_confirmed = map.get("tax_confirmed")
        .map(|v| v == "1")
        .unwrap_or(false);

    Ok(ShopSettings {
        shop_name: map.get("shop_name").cloned().unwrap_or_else(|| "Montreux Clothing".into()),
        owner_name: map.get("owner_name").cloned().unwrap_or_default(),
        shop_phone: map.get("shop_phone").cloned().unwrap_or_default(),
        shop_gst: map.get("shop_gst").cloned().unwrap_or_default(),
        shop_address: map.get("shop_address").cloned().unwrap_or_default(),
        invoice_footer: map.get("invoice_footer").cloned().unwrap_or_else(|| "Thank you for shopping at Montreux Clothing!".into()),
        gst_rate_percent,
        tax_confirmed,
    })
}

pub fn save_settings(path: &Path, settings: ShopSettings) -> Result<(), String> {
    let mut conn = open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let entries = [
        ("shop_name", settings.shop_name.trim().to_string()),
        ("owner_name", settings.owner_name.trim().to_string()),
        ("shop_phone", settings.shop_phone.trim().to_string()),
        ("shop_gst", settings.shop_gst.trim().to_string()),
        ("shop_address", settings.shop_address.trim().to_string()),
        ("invoice_footer", settings.invoice_footer.trim().to_string()),
        ("gst_rate_percent", format!("{:.2}", settings.gst_rate_percent)),
        ("tax_confirmed", if settings.tax_confirmed { "1" } else { "0" }.to_string()),
    ];

    for (k, v) in entries {
        tx.execute(
            "INSERT INTO settings(key, value, updated_at) VALUES(?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
            params![k, v],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------
// Backup & Restore
// ---------------------------------------------------------

pub fn export_backup(path: &Path) -> Result<String, String> {
    let products = get_products(path).map_err(|e| e.to_string())?;
    let bills = get_bills(path, BillFilter { search_customer: None, date_from: None, date_to: None, status: None })?;
    
    let conn = open(path).map_err(|e| e.to_string())?;
    let mut item_stmt = conn.prepare(
        "SELECT id, bill_id, product_id, product_name_snapshot, size, price_paise, quantity, total_paise 
         FROM bill_items ORDER BY id ASC"
    ).map_err(|e| e.to_string())?;

    let bill_items = item_stmt.query_map([], |r| {
        Ok(BillItemDetail {
            id: r.get(0)?,
            bill_id: r.get(1)?,
            product_id: r.get(2)?,
            product_name_snapshot: r.get(3)?,
            size: r.get(4)?,
            price_paise: r.get(5)?,
            quantity: r.get(6)?,
            total_paise: r.get(7)?,
        })
    }).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;

    let mut set_stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
    let settings = set_stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<HashMap<String, String>>>()
        .map_err(|e| e.to_string())?;

    let seq: i64 = conn.query_row(
        "SELECT current_value FROM invoice_sequences WHERE prefix='MC'",
        [],
        |r| r.get(0),
    ).unwrap_or(999);

    let backup = BackupPayload {
        version: 1,
        exported_at: chrono::Local::now().to_rfc3339(),
        products,
        bills,
        bill_items,
        settings,
        invoice_sequence: seq,
    };

    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

pub fn import_backup(path: &Path, json_data: &str) -> Result<ImportResult, String> {
    let backup: BackupPayload = serde_json::from_str(json_data)
        .map_err(|e| format!("Invalid backup format: {}", e))?;

    let mut conn = open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Clear existing records in a safe order respecting foreign keys
    tx.execute("DELETE FROM bill_items", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM bills", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM products", []).map_err(|e| e.to_string())?;

    // Restore products
    for p in &backup.products {
        tx.execute(
            "INSERT INTO products(id, name, price_paise, stock, threshold, is_active)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            params![p.id, p.name, p.price_paise, p.stock, p.threshold, if p.is_active { 1 } else { 0 }],
        ).map_err(|e| e.to_string())?;
    }

    // Restore bills
    for b in &backup.bills {
        tx.execute(
            "INSERT INTO bills(id, bill_no, date, customer_name, customer_phone, payment_method,
                               subtotal_paise, total_discount_paise, gst_amount_paise, grand_total_paise,
                               status, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                b.id, b.bill_no, b.date, b.customer_name, b.customer_phone, b.payment_method,
                b.subtotal_paise, b.total_discount_paise, b.gst_amount_paise, b.grand_total_paise,
                b.status, b.created_at
            ],
        ).map_err(|e| e.to_string())?;
    }

    // Restore bill items
    for item in &backup.bill_items {
        tx.execute(
            "INSERT INTO bill_items(id, bill_id, product_id, product_name_snapshot, size, price_paise, quantity, total_paise)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                item.id, item.bill_id, item.product_id, item.product_name_snapshot,
                item.size, item.price_paise, item.quantity, item.total_paise
            ],
        ).map_err(|e| e.to_string())?;
    }

    // Restore settings
    for (k, v) in &backup.settings {
        tx.execute(
            "INSERT INTO settings(key, value, updated_at) VALUES(?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
            params![k, v],
        ).map_err(|e| e.to_string())?;
    }

    // Restore invoice sequence
    tx.execute(
        "INSERT INTO invoice_sequences(prefix, current_value, updated_at) VALUES('MC', ?1, datetime('now'))
         ON CONFLICT(prefix) DO UPDATE SET current_value=MAX(excluded.current_value, invoice_sequences.current_value)",
        params![backup.invoice_sequence],
    ).map_err(|e| e.to_string())?;

    // Log restore event
    tx.execute(
        "INSERT INTO audit_logs(entity_type, entity_id, action, payload) VALUES('SYSTEM', 'DATABASE', 'RESTORE', ?1)",
        params![format!("Restored {} products, {} bills, {} items", backup.products.len(), backup.bills.len(), backup.bill_items.len())],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        products_imported: backup.products.len(),
        bills_imported: backup.bills.len(),
        items_imported: backup.bill_items.len(),
    })
}

// ---------------------------------------------------------
// CSV Reporting (RFC-4180 Escaped & Formula Protected)
// ---------------------------------------------------------

pub fn export_bills_csv(path: &Path, filter: BillFilter) -> Result<String, String> {
    let bills = get_bills(path, filter)?;
    let mut csv = String::from("Bill No,Date,Customer,Phone,Payment,Items Count,Subtotal (₹),Discount (₹),GST (₹),Grand Total (₹),Status\n");

    for b in bills {
        let safe_customer = escape_csv_cell(&b.customer_name);
        let safe_phone = escape_csv_cell(&b.customer_phone);
        let subtotal_rs = format!("{:.2}", (b.subtotal_paise as f64) / 100.0);
        let discount_rs = format!("{:.2}", (b.total_discount_paise as f64) / 100.0);
        let gst_rs = format!("{:.2}", (b.gst_amount_paise as f64) / 100.0);
        let grand_total_rs = format!("{:.2}", (b.grand_total_paise as f64) / 100.0);

        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{}\n",
            b.bill_no,
            b.date,
            safe_customer,
            safe_phone,
            b.payment_method,
            b.items_count,
            subtotal_rs,
            discount_rs,
            gst_rs,
            grand_total_rs,
            b.status,
        ));
    }
    Ok(csv)
}

fn escape_csv_cell(value: &str) -> String {
    let mut val = value.to_string();
    // Shield against CSV Formula Injection in Excel (=, +, -, @, \t, \r)
    if val.starts_with('=') || val.starts_with('+') || val.starts_with('-') || val.starts_with('@') {
        val = format!("'{}", val);
    }
    if val.contains(',') || val.contains('"') || val.contains('\n') || val.contains('\r') {
        format!("\"{}\"", val.replace('"', "\"\""))
    } else {
        val
    }
}
