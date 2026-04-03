# Releasing urordo

## Pre-release checklist

- [ ] `cargo test` passes
- [ ] `npm.cmd run build` passes
- [ ] `npx.cmd tauri dev` launches cleanly
- [ ] Version is correct in `src-tauri/tauri.conf.json`, `package.json`, and `src-tauri/Cargo.toml`
- [ ] Onboarding flow tested end to end on a clean machine
- [ ] Watcher flow tested for review mode, auto mode, and tray pause/resume
- [ ] History screen shows moves and rollback works
- [ ] License activation flow tested end to end
- [ ] Smart Mode toggle and Gemini key storage tested if shipping that feature
- [ ] Both installers tested on clean Windows 10 and Windows 11 machines
- [ ] Release notes prepared

## Build steps

```powershell
# From the project root:
.\scripts\make.ps1 -Production

# Clean old bundles first:
.\scripts\make.ps1 -Clean -Production
```

Artifacts are produced under:

- `src-tauri/target/release/bundle/msi/`
- `src-tauri/target/release/bundle/nsis/`

## GitHub Release steps

```bash
# 1. Commit the release state
git add -A
git commit -m "Release vX.Y.Z"

# 2. Tag it
git tag vX.Y.Z
git push origin HEAD
git push origin vX.Y.Z
```

Then create a GitHub Release and upload:

- the MSI from `src-tauri/target/release/bundle/msi/`
- the NSIS installer from `src-tauri/target/release/bundle/nsis/`

## SmartScreen warning

Unsigned Windows binaries will trigger SmartScreen on first launch.
For private beta this is usually acceptable. For broader launch, add code signing.

## Code signing

When code signing is ready, set these values in `src-tauri/tauri.conf.json`:

```json
"certificateThumbprint": "YOUR_CERT_THUMBPRINT",
"timestampUrl": "http://timestamp.digicert.com"
```

Then provide the signing material in CI or in the local environment before building.

## Offline license keys

urordo now verifies licenses with an embedded public key. The private key must stay outside the repository.

Generate a fresh pair if you ever need to rotate it:

```powershell
cargo run --bin keygen -- generate-keypair
```

To mint a license key:

```powershell
$env:URORDO_LICENSE_PRIVATE_KEY="<base64 32-byte private key>"
cargo run --bin keygen -- pro never <machine-id>
```

## Auto-update

The updater plumbing is implemented, but shipping updates still requires:

1. A generated updater key pair
2. The public key in `src-tauri/tauri.conf.json`
3. Release endpoints serving valid update metadata
4. Signed updater artifacts during build
5. End-to-end update verification on a clean machine

Official Tauri updater docs:
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/plugin/process/

## CI

The workflow at `.github/workflows/build.yml` builds Windows installers on demand.
Before relying on it for public releases, make sure the repository contains the exact release state you want and that any required signing secrets are configured.
