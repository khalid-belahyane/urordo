# urordo

Intelligent local-first file organiser for Windows.

urordo scans a folder, classifies every file by meaning instead of extension alone,
proposes a clean structure for review, and moves files only after the user approves.
Every operation is logged and can be rolled back from the Activity screen.

## Features

- **Review first** - see every proposed move before anything changes
- **Rollback** - undo completed operations from the Activity screen
- **Local first** - normal usage stays on the machine
- **Smart Mode** - optional Gemini support through the user's own API key
- **Watchers** - watch folders recursively and route new files into review or automation

## Development

```powershell
npm.cmd install
npx.cmd tauri dev
```

## Build

```powershell
# Debug build
.\scripts\make.ps1

# Release installers (NSIS + MSI)
.\scripts\make.ps1 -Production

# Release with version bump
.\scripts\make.ps1 -Production -Version "0.2.0"
```

## Landing page

The public download site lives in `website/` and is intentionally separate from the desktop app frontend.
Update `website/downloads.json` with the latest installer URLs before publishing it.

## Regenerate assets

```powershell
# App icons (all sizes - src-tauri/icons/ + public/)
python scripts/generate_logo.py

# Installer artwork (NSIS + WiX BMPs)
python scripts/generate_installer_images.py
```

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Framer Motion
- **Backend:** Rust, Tauri 2, SQLite (r2d2 + rusqlite)
- **Installers:** NSIS + WiX MSI

## License

Copyright 2026 urordo. See `src-tauri/wix/license.rtf` for full terms.
