# Montreux Clothing — Offline Billing Starter

This bundle contains the recovered source and the active Electron application:

1. `legacy-repaired/file.html` — a recovered browser version that completes the truncated HTML and restores missing inventory/settings/export functions. It is useful for checking the old workflow and recovering the UI.
2. `desktop-app/` — preserved Tauri source and data/business-rule reference.
3. `../../electron-app/` — the active Electron + React + TypeScript + SQLite application.

## Important status
The legacy HTML still uses browser `localStorage`; it is **not ACID-safe** and should not be used as the final production billing database. Use the Electron track for production development. Do not assume this starter is already packaged, signed, or fully acceptance-tested.

## Open the legacy recovery build
Open `legacy-repaired/file.html` in a browser. Export a JSON backup before experimenting with any existing data. Browser storage is tied to that browser profile and may be cleared.

## Run the Electron app on Linux
Install Node.js (LTS) and npm. Then:

```bash
cd electron-app
npm install
npm run dev
```

The first run creates the SQLite database in the operating system's persistent application-data directory, not in the source folder.

## Build
```bash
cd electron-app
npm run build
npm run package
```

The configured NSIS Windows installer must be built on Windows or with a correctly configured cross-build environment. A Windows installer has not been built in this Linux environment.

## Implemented in the Electron track
- Secure `contextBridge` IPC with renderer Node access disabled and renderer-origin checks
- SQLite initialization and versioned migrations in the Electron main process
- Persistent application-data database path and automatic pre-restore backup
- Dashboard, billing, history, inventory, settings, backup and CSV UI
- ACID sale/cancellation transactions with invoice sequence, snapshots, stock deduction and audit records
- Integer paise storage and trusted-backend validation
- Size/colour variant table with existing stock migrated into a `DEFAULT` variant
- Printer enumeration and invoice printing IPC hooks

## Still to do before real shop use
- First-class size/colour variant editing in the Inventory UI (schema and transaction path are in place)
- PDF generation and polished invoice print templates
- Legacy localStorage JSON migration validation against real shop data
- GST/accounting behavior review with the shop owner/accountant
- Automated tests, crash-recovery tests, Windows packaging and offline installer verification
- Security review, accessibility, and final UX polish

Do not use demo/sample products for actual sales until the inventory has been replaced with real stock.
