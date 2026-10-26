# Montreux Clothing Windows Packaging Report

**Report date:** 2026-10-26  
**Development environment:** Ubuntu Linux x64  
**Application:** Montreux Clothing offline billing and inventory

## Executive summary

The application is configured to produce a Windows NSIS installer with Electron Builder. Windows packaging is technically possible, but Windows installation and runtime compatibility are **not verified** from the current Ubuntu environment.

The local native SQLite module is a Linux binary and must not be copied into a Windows package. The recommended next step is to switch to a Windows x64 machine or hosted Windows CI runner, install dependencies there, rebuild `better-sqlite3` for Electron, build the installer, and test the installed application.

## Current verified configuration

| Component | Verified value |
|---|---|
| Packaging tool | Electron Builder `26.18.0` |
| Electron | `36.9.5` |
| Electron module ABI | `135` |
| SQLite driver | `better-sqlite3 12.4.1` |
| Intended Windows architecture | x64 |
| Windows target | NSIS |
| Linux target | AppImage |
| Windows SDK on Linux | Not installed |
| Visual Studio Build Tools on Linux | Not installed |
| Wine | Not installed |
| `wine64` | Not installed |
| System `makensis` | Not installed |
| Windows installer built here | No |
| Windows runtime tested here | No |

Configuration is defined in [package.json](./package.json). The relevant target is:

```json
"win": {
  "target": "nsis",
  "icon": "assets/icon.ico"
}
```

## Native SQLite evidence

The installed native module is identified as:

```text
linux--x64--135
```

The installed file is an ELF Linux binary:

```text
better_sqlite3.node: ELF 64-bit LSB shared object, x86-64
```

This proves compatibility with the local Linux Electron ABI `135`. It does **not** prove Windows compatibility. A Windows build must obtain or compile a Windows x64 `better_sqlite3.node` matching Electron `36.9.5` and ABI `135`.

The package uses:

```text
prebuild-install || node-gyp rebuild --release
```

The existing Linux native artifact must not be reused in a Windows installer.

## Verified commands during the audit

The following checks were run without modifying application files or installing dependencies:

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e \
  "console.log(JSON.stringify(process.versions))"
```

Result included:

```text
electron: 36.9.5
modules: 135
```

Packaging configuration was inspected with:

```bash
node -e "const p=require('./package.json'); ..."
./node_modules/.bin/electron-builder --help
```

Native module and platform were inspected with:

```bash
cat node_modules/better-sqlite3/build/Release/.forge-meta
file node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

Result:

```text
linux--x64--135
ELF 64-bit LSB shared object, x86-64
```

## Options

### Option A — Cross-package from Linux

Electron Builder supports Windows targets from non-Windows platforms in some configurations. This environment does not have Wine installed, and the complete NSIS flow was not executed.

Risks:

- Wine or builder-managed Windows tooling may be required.
- The exact Windows native SQLite binary may not be available automatically.
- A successful package command alone would not prove the application runs correctly on Windows.

### Option B — Cross-package with a verified prebuilt SQLite binary

This may work if an exact Windows x64 binary for `better-sqlite3 12.4.1`, Electron `36.9.5`, and ABI `135` is available and selected correctly.

This exact artifact was not verified during the audit. Do not manually copy a Windows binary from another Electron or Node version.

### Option C — Build on Windows

This is the recommended option. A Windows x64 build produces the native SQLite module in its target environment and allows the installer and runtime to be tested together.

A hosted Windows CI runner avoids downloading the Windows SDK and Visual Studio Build Tools onto the Linux development machine.

## Windows handoff procedure

Run the following commands on a Windows x64 machine or hosted Windows runner:

```powershell
cd electron-app
npm ci
npm run rebuild
npm run build
npm run package
```

The generated installer should be in:

```text
electron-app\release\
```

Before testing, confirm that the packaged application contains a Windows native SQLite binary rather than the Linux ELF file.

## Required Windows acceptance tests

### Installation and startup

- Install the generated NSIS `.exe`.
- Launch the installed application.
- Confirm the database initializes in a writable per-user application-data location.
- Confirm no remote web content is required.

### Products and variants

- Create a product with multiple sizes or other variants.
- Confirm each variant has independent stock.
- Edit the product and variants.
- Restart the application and confirm persistence.

### Billing

- Create a bill for one exact variant.
- Confirm only that variant's stock decreases.
- Confirm invoice history and line items are persisted.
- Repeat the same submission/idempotency request and confirm no duplicate bill is created.

### Cancellation and recovery

- Cancel a bill.
- Confirm the correct variant stock is restored.
- Confirm the original financial record remains in history.
- Close and reopen the application.
- Confirm products, stock, bills, and settings remain available.

### Backup and restore

- Create a backup using the application workflow.
- Validate the backup before restore.
- Restore into a test database or test profile.
- Confirm product, variant, stock, invoice, and related records remain consistent.
- Confirm a safety backup is created before replacing an existing database.
- Confirm an invalid backup does not damage the original database.

### Printing

- Enumerate available Windows printers.
- Print or preview an invoice.
- Confirm the invoice contains the correct bill data.
- Confirm printing does not create another sale or deduct stock again.

## Status and recommendation

### Linux

The existing Linux build and native Electron SQLite workflow remain verified according to the project’s current Phase 1 status and previous focused test results.

### Windows

Windows is currently **unverified**. No Windows installer, native Windows SQLite module, installation, first launch, billing flow, cancellation flow, restart persistence, or physical printer output was tested in this environment.

### Recommendation

Switch to Windows or a hosted Windows x64 runner and follow the handoff procedure above. Do not describe the application as Windows-verified or fully production-ready across platforms until the installer and runtime acceptance tests pass on Windows.
