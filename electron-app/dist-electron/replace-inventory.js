"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const database_1 = require("./database");
electron_1.app.whenReady().then(() => {
    if (process.env.CONFIRM_REPLACE_INVENTORY !== "YES") {
        throw new Error("Set CONFIRM_REPLACE_INVENTORY=YES to replace development inventory.");
    }
    const dbPath = (0, database_1.resolveDbPath)(electron_1.app.getPath("userData"));
    (0, database_1.initializeDb)(dbPath);
    const db = (0, database_1.openDb)(dbPath);
    db.transaction(() => {
        db.prepare(`UPDATE products SET is_active=0, updated_at=datetime('now')`).run();
        (0, database_1.saveProduct)(db, {
            id: null, name: "Baggy Shirt", size: "", category: "Top Wear",
            size_scale: "Letter", size_options: "S, M, L, XL", price_paise: 59900,
            stock: 0, threshold: 2, selected_sizes: ["S", "M", "L", "XL"],
            size_stocks: { S: 10, M: 10, L: 10, XL: 10 },
        });
        (0, database_1.saveProduct)(db, {
            id: null, name: "Formal Pant", size: "", category: "Bottom Wear",
            size_scale: "Waist", size_options: "28, 30, 32", price_paise: 89900,
            stock: 0, threshold: 2, selected_sizes: ["28", "30", "32"],
            size_stocks: { "28": 5, "30": 5, "32": 5 },
        });
        (0, database_1.saveProduct)(db, {
            id: null, name: "Sunglasses", size: "", category: "Glasses",
            size_scale: "None", size_options: "", price_paise: 49900,
            stock: 20, threshold: 2, selected_sizes: ["No size"],
            size_stocks: { "No size": 20 },
        });
    })();
    console.log("Development inventory archived and replacement catalog created.");
    db.close();
    electron_1.app.quit();
}).catch(error => {
    console.error(error);
    electron_1.app.exit(1);
});
