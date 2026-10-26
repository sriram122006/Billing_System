import { useState, useEffect, useCallback } from "react";
import type {
  Product,
  ProductInput,
  SaleRequest,
  SaleResponse,
  BillSummary,
  BillFilter,
  DashboardStats,
  ShopSettings,
} from "./types";
import {
  getProducts,
  saveProduct,
  adjustStock,
  deleteProduct,
  createSale,
  cancelSale,
  getDashboardStats,
  getBills,
  getBillDetail,
  getSettings,
  saveSettings,
  exportBackup,
  importBackup,
  exportCsv,
} from "./api";
import { DashboardView } from "./components/DashboardView";
import { BillingView } from "./components/BillingView";
import { HistoryView } from "./components/HistoryView";
import { InventoryView } from "./components/InventoryView";
import { SettingsView } from "./components/SettingsView";
import { InvoiceModal } from "./components/InvoiceModal";

export default function App() {
  const [currentPage, setCurrentPage] = useState<"dashboard" | "billing" | "history" | "inventory" | "settings">("billing");
  const [products, setProducts] = useState<Product[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [settings, setSettings] = useState<ShopSettings>({
    shop_name: "Montreux Clothing",
    owner_name: "",
    shop_phone: "",
    shop_gst: "",
    shop_address: "",
    invoice_footer: "Thank you for shopping at Montreux Clothing!",
    gst_rate_percent: 18.0,
    tax_confirmed: false,
  });

  const [activeInvoice, setActiveInvoice] = useState<any | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Offline SQLite POS Engine Ready.");

  // Data Loading
  const loadInitialData = useCallback(async () => {
    try {
      const [prods, stats, setts, bList] = await Promise.all([
        getProducts(),
        getDashboardStats(),
        getSettings(),
        getBills({}),
      ]);
      setProducts(prods);
      setDashboardStats(stats);
      setSettings(setts);
      setBills(bList);
      setStatusMessage("✓ Local database connected. All records persisted safely.");
    } catch (err: any) {
      setStatusMessage(`Database connection warning: ${err?.message || String(err)}`);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Refresh Helpers
  const refreshProducts = async () => {
    try {
      const prods = await getProducts();
      setProducts(prods);
    } catch (err: any) {
      console.error("Failed to refresh products:", err);
    }
  };

  const refreshDashboardAndBills = async () => {
    try {
      const [stats, bList, prods] = await Promise.all([
        getDashboardStats(),
        getBills({}),
        getProducts(),
      ]);
      setDashboardStats(stats);
      setBills(bList);
      setProducts(prods);
    } catch (err: any) {
      console.error("Failed to refresh data:", err);
    }
  };

  // Actions
  const handleSaveSale = async (sale: SaleRequest): Promise<SaleResponse> => {
    const res = await createSale(sale);
    await refreshDashboardAndBills();
    return res;
  };

  const handleCancelBill = async (billId: number, reason: string) => {
    await cancelSale(billId, reason);
    await refreshDashboardAndBills();
  };

  const handleFilterBills = async (filter: BillFilter) => {
    try {
      const filtered = await getBills(filter);
      setBills(filtered);
    } catch (err: any) {
      setStatusMessage(`Filter error: ${err?.message || String(err)}`);
    }
  };

  const handleViewBill = async (billId: number) => {
    try {
      const detail = await getBillDetail(billId);
      setActiveInvoice({
        bill_no: detail.bill.bill_no,
        date: detail.bill.date,
        customer_name: detail.bill.customer_name,
        customer_phone: detail.bill.customer_phone,
        payment_method: detail.bill.payment_method,
        items: detail.items,
        subtotal_paise: detail.bill.subtotal_paise,
        total_discount_paise: detail.bill.total_discount_paise,
        gst_amount_paise: detail.bill.gst_amount_paise,
        grand_total_paise: detail.bill.grand_total_paise,
      });
    } catch (err: any) {
      alert(`Could not load invoice: ${err?.message || String(err)}`);
    }
  };

  const handleSaveProduct = async (p: ProductInput) => {
    await saveProduct(p);
    await refreshProducts();
    const stats = await getDashboardStats();
    setDashboardStats(stats);
  };

  const handleAdjustStock = async (productId: number, delta: number, reason: string) => {
    await adjustStock(productId, delta, reason);
    await refreshProducts();
    const stats = await getDashboardStats();
    setDashboardStats(stats);
  };

  const handleDeleteProduct = async (productId: number) => {
    await deleteProduct(productId);
    await refreshProducts();
  };

  const handleSaveSettings = async (newSettings: ShopSettings) => {
    await saveSettings(newSettings);
    setSettings(newSettings);
  };

  const handleExportBackup = async () => {
    const jsonStr = await exportBackup();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `montreux_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (jsonContent: string) => {
    await importBackup(jsonContent);
    await loadInitialData();
  };

  const handleExportCsv = async (filter: BillFilter) => {
    const csvContent = await exportCsv(filter);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `montreux_invoices_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shell">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-title">MONTREUX</div>
            <div className="brand-subtitle">CLOTHING · POS</div>
          </div>
        </div>

        <nav>
          <ul className="nav-menu">
            <li>
              <button
                className={`nav-link ${currentPage === "dashboard" ? "active" : ""}`}
                onClick={() => setCurrentPage("dashboard")}
              >
                <span className="nav-icon">📊</span>
                <span>Dashboard</span>
              </button>
            </li>
            <li>
              <button
                className={`nav-link ${currentPage === "billing" ? "active" : ""}`}
                onClick={() => setCurrentPage("billing")}
              >
                <span className="nav-icon">🧾</span>
                <span>New Bill</span>
              </button>
            </li>
            <li>
              <button
                className={`nav-link ${currentPage === "history" ? "active" : ""}`}
                onClick={() => setCurrentPage("history")}
              >
                <span className="nav-icon">📜</span>
                <span>Bill History</span>
              </button>
            </li>
            <li>
              <button
                className={`nav-link ${currentPage === "inventory" ? "active" : ""}`}
                onClick={() => setCurrentPage("inventory")}
              >
                <span className="nav-icon">📦</span>
                <span>Inventory</span>
              </button>
            </li>
            <li>
              <button
                className={`nav-link ${currentPage === "settings" ? "active" : ""}`}
                onClick={() => setCurrentPage("settings")}
              >
                <span className="nav-icon">⚙️</span>
                <span>Settings</span>
              </button>
            </li>
          </ul>
        </nav>

        <div className="offline-pill">
          <span className="offline-dot" />
          <span>Offline SQLite · ACID Safe</span>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="page-title">
              {currentPage === "dashboard" && "Dashboard Overview"}
              {currentPage === "billing" && "Point of Sale (POS)"}
              {currentPage === "history" && "Invoice Records & History"}
              {currentPage === "inventory" && "Stock & Inventory Management"}
              {currentPage === "settings" && "Shop Settings & Data"}
            </h1>
            <p className="page-subtitle">
              {settings.shop_name} — Secure Offline Desktop Billing System
            </p>
          </div>
        </header>

        {statusMessage && <div className="notice-banner info">{statusMessage}</div>}

        {/* Views */}
        {currentPage === "dashboard" && (
          <DashboardView
            stats={dashboardStats}
            onViewBill={handleViewBill}
            onNavigate={(p) => setCurrentPage(p as any)}
          />
        )}

        {currentPage === "billing" && (
          <BillingView
            products={products}
            gstRate={settings.gst_rate_percent}
            onSaveSale={handleSaveSale}
            onPrintPreview={(preview) => setActiveInvoice(preview)}
            onRefreshProducts={refreshProducts}
          />
        )}

        {currentPage === "history" && (
          <HistoryView
            bills={bills}
            onFilterBills={handleFilterBills}
            onViewBill={handleViewBill}
            onCancelBill={handleCancelBill}
            onExportCsv={handleExportCsv}
          />
        )}

        {currentPage === "inventory" && (
          <InventoryView
            products={products}
            onSaveProduct={handleSaveProduct}
            onAdjustStock={handleAdjustStock}
            onDeleteProduct={handleDeleteProduct}
          />
        )}

        {currentPage === "settings" && (
          <SettingsView
            settings={settings}
            onSaveSettings={handleSaveSettings}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
          />
        )}
      </main>

      {/* Invoice Modal Preview */}
      {activeInvoice && (
        <InvoiceModal
          invoiceData={activeInvoice}
          settings={settings}
          onClose={() => setActiveInvoice(null)}
        />
      )}
    </div>
  );
}
