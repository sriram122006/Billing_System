import { app } from "electron";
import { initializeDb, openDb, resolveDbPath, saveProduct } from "./database";

app.whenReady().then(() => {
  if (process.env.CONFIRM_REPLACE_INVENTORY !== "YES") {
    throw new Error("Set CONFIRM_REPLACE_INVENTORY=YES to replace development inventory.");
  }
  const dbPath = resolveDbPath(app.getPath("userData"));
  initializeDb(dbPath);
  const db = openDb(dbPath);
  db.transaction(() => {
    db.prepare(`UPDATE products SET is_active=0, updated_at=datetime('now')`).run();
    saveProduct(db, {
      id: null, name: "Baggy Shirt", size: "", category: "Top Wear",
      size_scale: "Letter", size_options: "S, M, L, XL", price_paise: 59900,
      stock: 0, threshold: 2, selected_sizes: ["S", "M", "L", "XL"],
      size_stocks: { S: 10, M: 10, L: 10, XL: 10 },
    });
    saveProduct(db, {
      id: null, name: "Formal Pant", size: "", category: "Bottom Wear",
      size_scale: "Waist", size_options: "28, 30, 32", price_paise: 89900,
      stock: 0, threshold: 2, selected_sizes: ["28", "30", "32"],
      size_stocks: { "28": 5, "30": 5, "32": 5 },
    });
    saveProduct(db, {
      id: null, name: "Sunglasses", size: "", category: "Glasses",
      size_scale: "None", size_options: "", price_paise: 49900,
      stock: 20, threshold: 2, selected_sizes: ["No size"],
      size_stocks: { "No size": 20 },
    });
  })();
  console.log("Development inventory archived and replacement catalog created.");
  db.close();
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
