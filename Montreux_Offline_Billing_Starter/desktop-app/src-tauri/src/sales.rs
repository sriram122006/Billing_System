use crate::db::open;
use rusqlite::{params, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Debug, Deserialize, Clone)]
pub struct SaleLineInput {
    pub product_id: i64,
    pub size: String,
    pub quantity: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SaleRequest {
    pub date: String,
    pub customer_name: String,
    pub customer_phone: String,
    pub payment_method: String,
    pub items: Vec<SaleLineInput>,
    pub discount_percent: f64,
    pub discount_flat_paise: i64,
    pub apply_gst: bool,
}

#[derive(Debug, Serialize)]
pub struct SaleResponse {
    pub id: i64,
    pub bill_no: String,
    pub total_paise: i64,
}

pub fn create_sale(path: &Path, sale: SaleRequest) -> Result<SaleResponse, String> {
    if sale.customer_name.trim().is_empty() {
        return Err("Customer name is required.".into());
    }
    if !["Cash", "UPI", "Card", "Pending"].contains(&sale.payment_method.as_str()) {
        return Err("Unsupported payment method.".into());
    }
    if sale.items.is_empty() {
        return Err("At least one line item is required.".into());
    }
    if !sale.discount_percent.is_finite() || !(0.0..=100.0).contains(&sale.discount_percent) {
        return Err("Discount percentage must be between 0 and 100.".into());
    }
    if sale.discount_flat_paise < 0 {
        return Err("Flat discount cannot be negative.".into());
    }

    let mut conn = open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;

    // Step 1: Aggregate duplicate product line items to validate cumulative stock
    let mut requested: BTreeMap<i64, i64> = BTreeMap::new();
    for item in &sale.items {
        if item.quantity <= 0 {
            return Err("Every item quantity must be a positive whole number.".into());
        }
        if item.size.trim().is_empty() {
            return Err("Size is required for each item.".into());
        }
        let entry = requested.entry(item.product_id).or_insert(0);
        *entry = entry.checked_add(item.quantity).ok_or("Quantity overflow")?;
    }

    // Step 2: Query catalog and assert available stock for each distinct product
    let mut catalog: BTreeMap<i64, (String, i64, i64)> = BTreeMap::new();
    for (product_id, quantity) in &requested {
        let row: Option<(String, i64, i64)> = tx.query_row(
            "SELECT name, price_paise, stock FROM products WHERE id=?1 AND is_active=1",
            params![product_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).optional().map_err(|e| e.to_string())?;

        let (name, price, stock) = row.ok_or_else(|| format!("Product {product_id} not found or inactive."))?;
        if stock < *quantity {
            return Err(format!("Insufficient stock for \"{name}\": requested {quantity}, available {stock}."));
        }
        catalog.insert(*product_id, (name, price, stock));
    }

    // Step 3: Compute exact integer paise calculations
    let mut subtotal: i64 = 0;
    let mut lines = Vec::new();
    for item in &sale.items {
        let (name, price, _) = catalog.get(&item.product_id).ok_or("Missing product in catalog")?;
        let line_total = price.checked_mul(item.quantity).ok_or("Line total overflow")?;
        subtotal = subtotal.checked_add(line_total).ok_or("Subtotal overflow")?;
        lines.push((item.product_id, name.clone(), item.size.clone(), *price, item.quantity, line_total));
    }

    let percent_discount = ((subtotal as f64) * (sale.discount_percent / 100.0)).round() as i64;
    let combined_discount = percent_discount.checked_add(sale.discount_flat_paise).ok_or("Discount overflow")?;
    let total_discount = subtotal.min(combined_discount);
    let after_discount = subtotal - total_discount;

    let gst_rate: f64 = tx.query_row(
        "SELECT CAST(value AS REAL) FROM settings WHERE key='gst_rate_percent'",
        [],
        |r| r.get(0),
    ).unwrap_or(18.0);

    let gst_amount = if sale.apply_gst {
        ((after_discount as f64) * (gst_rate / 100.0)).round() as i64
    } else {
        0
    };
    let total = after_discount.checked_add(gst_amount).ok_or("Grand total overflow")?;

    // Step 4: Safely generate sequential invoice number
    let current: i64 = tx.query_row(
        "SELECT current_value FROM invoice_sequences WHERE prefix='MC'",
        [],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let next = current.checked_add(1).ok_or("Invoice sequence overflow")?;
    tx.execute(
        "UPDATE invoice_sequences SET current_value=?1, updated_at=datetime('now') WHERE prefix='MC'",
        params![next],
    ).map_err(|e| e.to_string())?;
    let bill_no = format!("MC{next}");

    // Step 5: Insert master bill
    tx.execute(
        "INSERT INTO bills(bill_no, date, customer_name, customer_phone, payment_method,
                           subtotal_paise, discount_percent, discount_flat_paise, total_discount_paise,
                           apply_gst, gst_rate_percent, gst_amount_paise, grand_total_paise, status)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'COMPLETED')",
        params![
            bill_no,
            sale.date,
            sale.customer_name.trim(),
            sale.customer_phone.trim(),
            sale.payment_method,
            subtotal,
            sale.discount_percent,
            sale.discount_flat_paise,
            total_discount,
            if sale.apply_gst { 1 } else { 0 },
            gst_rate,
            gst_amount,
            total
        ],
    ).map_err(|e| e.to_string())?;
    let bill_id = tx.last_insert_rowid();

    // Step 6: Insert bill line items snapshot
    for (product_id, name, size, price, quantity, line_total) in lines {
        tx.execute(
            "INSERT INTO bill_items(bill_id, product_id, product_name_snapshot, size, price_paise, quantity, total_paise)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![bill_id, product_id, name, size, price, quantity, line_total],
        ).map_err(|e| e.to_string())?;
    }

    // Step 7: Deduct stock atomically with concurrency guard
    for (product_id, quantity) in requested {
        let updated = tx.execute(
            "UPDATE products 
             SET stock = stock - ?1, updated_at = datetime('now') 
             WHERE id = ?2 AND stock >= ?1",
            params![quantity, product_id],
        ).map_err(|e| e.to_string())?;

        if updated != 1 {
            return Err(format!("Stock changed unexpectedly during transaction for product {product_id}; transaction aborted."));
        }
    }

    // Step 8: Create audit log
    let audit_payload = serde_json::json!({
        "bill_no": bill_no,
        "customer_name": sale.customer_name.trim(),
        "subtotal_paise": subtotal,
        "discount_paise": total_discount,
        "gst_paise": gst_amount,
        "grand_total_paise": total
    }).to_string();

    tx.execute(
        "INSERT INTO audit_logs(entity_type, entity_id, action, payload) VALUES('BILL', ?1, 'SALE', ?2)",
        params![bill_id.to_string(), audit_payload],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(SaleResponse { id: bill_id, bill_no, total_paise: total })
}

pub fn cancel_sale(path: &Path, bill_id: i64, reason: String) -> Result<(), String> {
    if reason.trim().is_empty() {
        return Err("A cancellation reason is required for audit purposes.".into());
    }

    let mut conn = open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;

    let (status, bill_no): (String, String) = tx.query_row(
        "SELECT status, bill_no FROM bills WHERE id=?1",
        params![bill_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|_| format!("Bill {bill_id} not found."))?;

    if status != "COMPLETED" {
        return Err(format!("Bill {bill_no} cannot be cancelled because its status is already {status}."));
    }

    // Update bill status to CANCELLED
    tx.execute(
        "UPDATE bills SET status='CANCELLED', updated_at=datetime('now') WHERE id=?1",
        params![bill_id],
    ).map_err(|e| e.to_string())?;

    // Fetch line items to restock
    let mut stmt = tx.prepare(
        "SELECT product_id, quantity FROM bill_items WHERE bill_id=?1"
    ).map_err(|e| e.to_string())?;

    let items: Vec<(i64, i64)> = stmt.query_map(params![bill_id], |r| {
        Ok((r.get(0)?, r.get(1)?))
    }).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;

    for (product_id, quantity) in items {
        tx.execute(
            "UPDATE products 
             SET stock = stock + ?1, updated_at = datetime('now') 
             WHERE id = ?2",
            params![quantity, product_id],
        ).map_err(|e| e.to_string())?;
    }

    // Record audit log
    let audit_payload = serde_json::json!({
        "bill_id": bill_id,
        "bill_no": bill_no,
        "reason": reason.trim(),
        "cancelled_at": chrono::Local::now().to_rfc3339(),
    }).to_string();

    tx.execute(
        "INSERT INTO audit_logs(entity_type, entity_id, action, payload) VALUES('BILL', ?1, 'CANCEL', ?2)",
        params![bill_id.to_string(), audit_payload],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------
// Unit and Integration Tests for ACID Sale Transaction
// ---------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::initialize;
    use std::fs;

    fn setup_test_db(test_name: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("montreux_test_{}_{}.sqlite3", test_name, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        if path.exists() { let _ = fs::remove_file(&path); }
        initialize(&path).unwrap();
        path
    }

    #[test]
    fn test_successful_multi_item_sale() {
        let db_path = setup_test_db("multi_item");
        let sale = SaleRequest {
            date: "2026-10-25".into(),
            customer_name: "John Doe".into(),
            customer_phone: "9876543210".into(),
            payment_method: "Cash".into(),
            items: vec![
                SaleLineInput { product_id: 1, size: "M".into(), quantity: 2 },
                SaleLineInput { product_id: 2, size: "L".into(), quantity: 1 },
            ],
            discount_percent: 10.0,
            discount_flat_paise: 0,
            apply_gst: true,
        };

        let res = create_sale(&db_path, sale).expect("Sale should succeed");
        assert_eq!(res.bill_no, "MC1000");

        // Verify stock was deducted: Product 1 originally 50 -> 48; Product 2 originally 40 -> 39
        let conn = open(&db_path).unwrap();
        let stock1: i64 = conn.query_row("SELECT stock FROM products WHERE id=1", [], |r| r.get(0)).unwrap();
        let stock2: i64 = conn.query_row("SELECT stock FROM products WHERE id=2", [], |r| r.get(0)).unwrap();
        assert_eq!(stock1, 48);
        assert_eq!(stock2, 39);

        // Verify audit log exists
        let audit_count: i64 = conn.query_row("SELECT COUNT(*) FROM audit_logs WHERE entity_type='BILL'", [], |r| r.get(0)).unwrap();
        assert_eq!(audit_count, 1);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn test_insufficient_stock_rollback() {
        let db_path = setup_test_db("insufficient_stock");
        let sale = SaleRequest {
            date: "2026-10-25".into(),
            customer_name: "Jane Doe".into(),
            customer_phone: "".into(),
            payment_method: "UPI".into(),
            items: vec![
                SaleLineInput { product_id: 1, size: "M".into(), quantity: 999 }, // exceeds 50 available
            ],
            discount_percent: 0.0,
            discount_flat_paise: 0,
            apply_gst: false,
        };

        let res = create_sale(&db_path, sale);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Insufficient stock"));

        // Verify NO stock changed and NO bill created
        let conn = open(&db_path).unwrap();
        let stock1: i64 = conn.query_row("SELECT stock FROM products WHERE id=1", [], |r| r.get(0)).unwrap();
        assert_eq!(stock1, 50);

        let bill_count: i64 = conn.query_row("SELECT COUNT(*) FROM bills", [], |r| r.get(0)).unwrap();
        assert_eq!(bill_count, 0);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn test_duplicate_product_aggregate_stock_guard() {
        let db_path = setup_test_db("duplicate_lines");
        // Product 1 has stock 50. Ordering 30 M and 25 L total = 55 > 50. Must reject!
        let sale = SaleRequest {
            date: "2026-10-25".into(),
            customer_name: "Alex".into(),
            customer_phone: "".into(),
            payment_method: "Card".into(),
            items: vec![
                SaleLineInput { product_id: 1, size: "M".into(), quantity: 30 },
                SaleLineInput { product_id: 1, size: "L".into(), quantity: 25 },
            ],
            discount_percent: 0.0,
            discount_flat_paise: 0,
            apply_gst: false,
        };

        let res = create_sale(&db_path, sale);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Insufficient stock"));

        let conn = open(&db_path).unwrap();
        let stock1: i64 = conn.query_row("SELECT stock FROM products WHERE id=1", [], |r| r.get(0)).unwrap();
        assert_eq!(stock1, 50);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn test_cancel_sale_restores_stock() {
        let db_path = setup_test_db("cancel_restock");
        let sale = SaleRequest {
            date: "2026-10-25".into(),
            customer_name: "Return Customer".into(),
            customer_phone: "".into(),
            payment_method: "Cash".into(),
            items: vec![
                SaleLineInput { product_id: 1, size: "S".into(), quantity: 5 },
            ],
            discount_percent: 0.0,
            discount_flat_paise: 0,
            apply_gst: false,
        };

        let res = create_sale(&db_path, sale).unwrap();
        let conn = open(&db_path).unwrap();
        let stock_after_sale: i64 = conn.query_row("SELECT stock FROM products WHERE id=1", [], |r| r.get(0)).unwrap();
        assert_eq!(stock_after_sale, 45);

        // Cancel the sale
        cancel_sale(&db_path, res.id, "Customer returned unworn items with receipt".into()).unwrap();

        // Verify status is CANCELLED and stock restored to 50
        let (status, stock_after_cancel): (String, i64) = conn.query_row(
            "SELECT b.status, p.stock FROM bills b, products p WHERE b.id=?1 AND p.id=1",
            params![res.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();

        assert_eq!(status, "CANCELLED");
        assert_eq!(stock_after_cancel, 50);
        let _ = fs::remove_file(&db_path);
    }
}
