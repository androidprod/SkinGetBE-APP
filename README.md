# SkinGetBE GUI

React + TypeScript + Vite + shadcn/ui (preset `b2oDXI9oW`) desktop GUI for
SkinGetBE-Rust, packaged with Tauri.

## Development

```powershell
npm install
npm run tauri:dev
```

The embedded Rust implementation is in `src-tauri/skingetbe`. The Tauri
backend exposes configuration loading/saving and server start/stop commands to
the React UI.

The embedded core is synchronized from the local `../SkinGetBE-Rust` checkout.
The server uses NetherNet HTTP signaling on the configured port and LAN discovery
on port 7551; the ports must be available when starting the server.
The Server, Settings and Captured skins tabs use Tauri commands to control the
server, persist `config.jsonc`, and list saved PNG captures with their metadata.
Settings and skins are stored in Tauri's per-user app data directory. Existing
`config.jsonc` and `skins/` files beside the executable are copied on first use
without removing the originals.

Desktop bundles include Windows (`.ico`), macOS (`.icns`) and Linux (`.png`)
icons. Builds for macOS/Linux must be run on a compatible host with the Tauri
toolchain installed. Android icons are generated, but Android packaging and
the NetherNet LAN/WebRTC behavior have not been tested; Android support is
 not yet guaranteed.

Each captured skin has View (in-app PNG preview), Share and Show in folder
actions. Share uses the system Web Share menu when available; otherwise, on
desktop it opens a Save As dialog to export a copy of the PNG. Show in folder
is supported on desktop only (the Tauri opener does not support Android/iOS).

## Checks

```powershell
npm run lint
npm run build
```

## GitHub Releases

Commit this project (including `.github/workflows/release.yml`) to your GitHub
repository's default branch. In **Releases → Draft a new release**, select or
create the tag and enter the release title, then click **Publish release**.
Publishing (including publishing a draft or prerelease) starts the workflow.
It builds and tests the code at the selected tag and uploads the assets to that
existing release without changing its tag, title, notes, or release status.
The release is visible immediately, but its assets will appear only after all
builds and tests succeed. If a job fails, check **Actions → Release**; a
rerun cannot upload an asset whose name already exists in the release. For
accurate installer versioning, update `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml` before creating the tag.

Assets: Windows x64 executable and NSIS installer; Linux x64 executable,
`.deb`, and `.AppImage`; Linux arm64 executable and `.deb`; macOS Apple Silicon
`.dmg`. Run `chmod +x` on downloaded Linux binaries/AppImages. Raw Linux
executables need WebKitGTK and other runtime libraries; prefer the packages.
The macOS and Windows bundles are unsigned and may trigger
OS security warnings until code signing/notarization is configured. This
workflow has not yet been run on GitHub-hosted runners.
