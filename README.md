<div align="center">

<img src="src-tauri/icons/icon.png" width="80" alt="SkinGetBE logo" />

# SkinGetBE GUI

**Desktop interface for capturing Minecraft Bedrock Edition skins over NetherNet (WebRTC)**

[![Tauri](https://img.shields.io/badge/Desktop-Tauri%202-orange?style=flat-square)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Backend-Rust-orange?style=flat-square&logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20shadcn%2Fui-blue?style=flat-square&logo=react)](https://react.dev/)

**English** | [日本語](README.ja.md)

</div>

## Overview

SkinGetBE GUI packages the [SkinGetBE-Rust](https://github.com/androidprod/SkinGetBE-Rust) core in a Tauri desktop app. It accepts Minecraft Bedrock NetherNet connections, extracts the skin from a Login packet, and saves a PNG with a JSON metadata sidecar. It is **not a playable game server**: after capture, the client is disconnected.

The Rust core is included at `src-tauri/skingetbe`; installing or cloning the upstream repository separately is **not** required. The interface is built with React, TypeScript, Vite and shadcn/ui.

> **Research tool:** Do not use this as an authenticated public server. The core reads JWT payloads but does not verify the Login chain's signatures or authenticate player identities. WebRTC encryption does not provide Login authentication.

## Features and limitations

- **Server tab:** Start/stop the NetherNet server and read its runtime log.
- **Settings tab:** Edit the version, protocol, bind address, HTTP signaling port and skin save mode. Save the settings as `config.jsonc`; restart the server to apply changes.
- **Captured skins tab:** List saved PNGs with player/skin metadata (when the JSON sidecar exists), file size and modification time. Preview a PNG, share it where the system supports Web Share, or reveal it in the desktop file manager. If Web Share is unavailable, **Share** opens a desktop Save As dialog to export a PNG copy.
- HTTP signaling uses TCP `port` (default **19132**); LAN discovery uses UDP **7551**. WebRTC also allocates additional UDP sockets.
- Save modes: `0` disabled, `1` overwrite and `2` numbered duplicates.
- Windows, Linux, macOS and Android builds are configured. Android networking and sharing on a device are **not verified**. Revealing a file in the file manager and Save As are desktop-only.
- No Xbox Live session registration, Microsoft-authenticated server mode or full playable server. Cape images and geometry are not saved as separate files.

### Data flow

```text
Minecraft Bedrock → HTTP signaling / LAN discovery → NetherNet (WebRTC)
  → Bedrock Login → skin extraction → app data/skins/<player>_<skinId>.png + .json
  → PlayStatus / Disconnect → session closed
```

## Install and run

Download an asset from [GitHub Releases](https://github.com/androidprod/SkinGetBE-APP/releases) if available. The release workflow produces Windows x64/arm64 installers and executables, Linux x64 `.deb`/`.AppImage` and executable, Linux arm64 `.deb` and executable, macOS Intel/Apple Silicon `.dmg` files, and signed universal Android `.apk` and `.aab` packages (including arm64, armv7, x86 and x64). Install the `.apk` on Android; the `.aab` is for store distribution. Raw Linux executables need system WebKitGTK libraries; use `chmod +x` for downloaded executables/AppImages. Windows and macOS bundles are not code-signed and may show OS security warnings.

Open the app, choose **Server → Start server**, then connect from Minecraft Bedrock through its LAN list or with the server address and configured signaling port. On successful Login, the client disconnects and the PNG appears in **Captured skins**. This does not mean the server can be used for gameplay.

## Build from source

Install [Node.js 22](https://nodejs.org/), npm, a current stable [Rust toolchain](https://rustup.rs/) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS (including WebKitGTK 4.1 development packages on Linux). Build on the OS you want to distribute for. Cargo downloads the NetherNet Git dependency on first build.

```bash
npm ci
npm run tauri:dev   # development window
npm run tauri:build # release binary and OS-specific bundles
```

Frontend and Rust checks:

```bash
npm run lint
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/skingetbe/Cargo.toml --locked
```

`npm run build` builds only the web frontend in `dist/`; use `npm run tauri:build` for the desktop application.

## Settings and saved files

On first launch, the GUI creates `config.jsonc` in **Tauri's per-user app data directory**, not next to the executable. Captures go into its `skins/` subdirectory; the Captured skins tab displays the exact path on your system. If an older portable installation has `config.jsonc` or `skins/` beside its executable, the GUI copies the config or top-level skin files only when their destination file or `skins/` directory, respectively, does not yet exist. The originals are not deleted.

```json
{
  "version": "1.26.21",
  "protocol": 975,
  "port": 19132,
  "bind_addr": "0.0.0.0",
  "savemode": 2
}
```

| Key                   | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `port`                | HTTP signaling **TCP** listen port; default `19132`             |
| `bind_addr`           | Bind address for signaling and LAN discovery; default `0.0.0.0` |
| `protocol`, `version` | Configured Bedrock protocol/version; defaults `975` / `1.26.21` |
| `savemode`            | `0` no file, `1` overwrite, `2` create numbered copies          |

JSONC comments are supported. An empty `version` or a `protocol` value of `0` is replaced with the core's latest known value on load; omitted keys retain their built-in defaults. **Currently, discovery advertises the latest version from the embedded core instead of the configured version/protocol.** The displayed settings and advertised version can therefore differ.

Unlike the upstream **CLI** (which stores files beside its executable), this **GUI** uses Tauri's app data directory. `skins/Steve_Standard_Steve.png` and the matching `.json` are example files; mode `2` adds suffixes such as `_1` for duplicates. A preview/share is limited to PNG files up to 8 MiB.

## GitHub Releases

After pushing the workflow to your GitHub repository, open **Actions → Release → Run workflow**. Select the branch and enter a release tag, optional title and the prerelease/draft options. This workflow is **manual only**: it runs tests and native builds first, then creates (or verifies) the tag and attaches all assets to a GitHub Release. An existing tag must point to the selected commit. Update the version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` before a new release so installer versions match the chosen tag; the workflow does not enforce a tag/version match. The workflow has not yet been verified on GitHub-hosted runners.

Android release builds require four GitHub Actions Secrets: `ANDROID_KEYSTORE_BASE64` (base64-encoded keystore), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The release job fails if any are missing. Create a keystore with `keytool -genkeypair -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`, then add the output of `base64 -w 0 release.jks` (on macOS: `base64 -i release.jks | tr -d '\n'`) as the base64 secret. Never commit signing keys or passwords. For local Android development, install the [Tauri Android prerequisites](https://v2.tauri.app/start/prerequisites/#android), then run `npm run tauri -- android init` and `npm run tauri -- android dev`. Generated `src-tauri/gen/android/` files are ignored by Git.

## Troubleshooting

- **Cannot start:** TCP `port` and UDP `7551` must both be available. An error is shown in the Server log. On Windows, check `Get-NetTCPConnection -LocalPort 19132` and `Get-NetUDPEndpoint -LocalPort 7551`.
- **Cannot connect from another device:** Allow the configured TCP port and required UDP traffic through the firewall. WebRTC may use other dynamically allocated UDP ports; forwarding TCP `19132` alone does not guarantee internet connectivity. Try LAN first.
- **Connected but no skin:** Look for `Detected Player` and a save message in the Server log; a transport connection alone does not imply a successful Login. Check `savemode` and the app data path in Captured skins.
- **Wrong version shown:** The default config is `975 / 1.26.21`, while discovery advertises the core's latest mapping (`2225 / 26.60` in the current embedded core). Changing the UI fields does not change this discovery behavior.
- **Share or Show in folder unavailable:** Web Share depends on the platform; desktop sharing falls back to Save As. The file manager action is not supported on Android/iOS. Android support is not guaranteed.

## Project layout

| Path                            | Role                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `src/App.tsx`                   | Server, Settings and Captured skins interface                                |
| `src-tauri/src/main.rs`         | Tauri commands, app data/config paths, skin listing and file actions         |
| `src-tauri/src/nethernet.rs`    | NetherNet listeners, Bedrock sessions and skin saving                        |
| `src-tauri/skingetbe/`          | Embedded Rust core (Bedrock parsing, skin extraction and legacy RakNet code) |
| `src-tauri/tauri.conf.json`     | Tauri window, app identifier and bundle settings                             |
| `.github/workflows/release.yml` | Manual multi-platform build, test and release workflow                       |

## References and license

- [SkinGetBE-Rust](https://github.com/androidprod/SkinGetBE-Rust) · [NetherNet implementation](https://github.com/bedrock-crustaceans/nethernet) · [Tauri documentation](https://v2.tauri.app/)
- The embedded SkinGetBE-Rust core includes an [MIT License](src-tauri/skingetbe/LICENSE). No separate license file for the GUI is currently provided in this repository.
