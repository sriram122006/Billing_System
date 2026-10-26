#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod sales;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db_path: std::path::PathBuf,
    pub db_lock: Mutex<()>,
}

// ---------------------------------------------------------
// Inventory Commands
// ---------------------------------------------------------

#[tauri::command]
fn get_products(state: tauri::State<'_, AppState>) -> Result<Vec<db::Product>, String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::get_products(&state.db_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_product(state: tauri::State<'_, AppState>, product: db::ProductInput) -> Result<(), String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::save_product(&state.db_path, product)
}

#[tauri::command]
fn adjust_stock(state: tauri::State<'_, AppState>, product_id: i64, delta: i64, reason: String) -> Result<(), String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::adjust_stock(&state.db_path, product_id, delta, reason)
}

#[tauri::command]
fn delete_product(state: tauri::State<'_, AppState>, product_id: i64) -> Result<(), String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::delete_product(&state.db_path, product_id)
}

// ---------------------------------------------------------
// Sales & Billing Commands
// ---------------------------------------------------------

#[tauri::command]
fn create_sale(state: tauri::State<'_, AppState>, sale: sales::SaleRequest) -> Result<sales::SaleResponse, String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    sales::create_sale(&state.db_path, sale)
}

#[tauri::command]
fn cancel_sale(state: tauri::State<'_, AppState>, bill_id: i64, reason: String) -> Result<(), String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    sales::cancel_sale(&state.db_path, bill_id, reason)
}

// ---------------------------------------------------------
// Dashboard & History Commands
// ---------------------------------------------------------

#[tauri::command]
fn get_dashboard_stats(state: tauri::State<'_, AppState>) -> Result<db::DashboardStats, String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::get_dashboard_stats(&state.db_path)
}

#[tauri::command]
fn get_bills(state: tauri::State<'_, AppState>, filter: db::BillFilter) -> Result<Vec<db::BillSummary>, String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::get_bills(&state.db_path, filter)
}

#[tauri::command]
fn get_bill_detail(state: tauri::State<'_, AppState>, bill_id: i64) -> Result<db::BillDetail, String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::get_bill_detail(&state.db_path, bill_id)
}

// ---------------------------------------------------------
// Settings, Reports & Backup Commands
// ---------------------------------------------------------

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> Result<db::ShopSettings, String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::get_settings(&state.db_path)
}

#[tauri::command]
fn save_settings(state: tauri::State<'_, AppState>, settings: db::ShopSettings) -> Result<(), String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::save_settings(&state.db_path, settings)
}

#[tauri::command]
fn export_backup(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::export_backup(&state.db_path)
}

#[tauri::command]
fn import_backup(state: tauri::State<'_, AppState>, json_data: String) -> Result<db::ImportResult, String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::import_backup(&state.db_path, &json_data)
}

#[tauri::command]
fn export_csv(state: tauri::State<'_, AppState>, filter: db::BillFilter) -> Result<String, String> {
    let _guard = state.db_lock.lock().map_err(|e| e.to_string())?;
    db::export_bills_csv(&state.db_path, filter)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Persistent application data path outside the installation folder
            let app_data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data)?;
            let db_path = app_data.join("montreux_pos.sqlite3");
            db::initialize(&db_path)?;
            app.manage(AppState {
                db_path,
                db_lock: Mutex::new(()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_products,
            save_product,
            adjust_stock,
            delete_product,
            create_sale,
            cancel_sale,
            get_dashboard_stats,
            get_bills,
            get_bill_detail,
            get_settings,
            save_settings,
            export_backup,
            import_backup,
            export_csv
        ])
        .run(tauri::generate_context!())
        .expect("error while running Montreux Clothing Billing desktop application");
}
