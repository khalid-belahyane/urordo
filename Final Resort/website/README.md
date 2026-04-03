# urordo landing page

This folder is the public website and download surface for the desktop app.

## How to use it

1. Host the files in this folder on any static host.
2. Update `downloads.json` with the latest installer URLs.
3. Point the main CTA to the NSIS installer and the secondary CTA to the MSI.
4. Optionally set `releaseNotesUrl` to the GitHub Release page.

## Recommended download strategy

- `downloads.nsis`: consumer-friendly primary installer
- `downloads.msi`: secondary installer for IT-managed environments

This folder is intentionally separate from the app frontend so the website never depends on Tauri APIs or localhost behavior.
