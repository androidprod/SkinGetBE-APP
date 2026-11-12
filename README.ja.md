<div align="center">

<img src="src-tauri/icons/icon.png" width="80" alt="SkinGetBE ロゴ" />

# SkinGetBE GUI

**NetherNet（WebRTC）経由の Minecraft Bedrock Edition スキン取得ツールのデスクトップ GUI**

[![Tauri](https://img.shields.io/badge/Desktop-Tauri%202-orange?style=flat-square)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Backend-Rust-orange?style=flat-square&logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20shadcn%2Fui-blue?style=flat-square&logo=react)](https://react.dev/)

[English](README.md) | **日本語**

</div>

## 概要

SkinGetBE GUI は [SkinGetBE-Rust](https://github.com/androidprod/SkinGetBE-Rust) のコアを Tauri アプリに組み込んだデスクトップ版です。Minecraft Bedrock クライアントの NetherNet 接続を受け、Login パケットからスキンを抽出して PNG と JSON メタデータに保存します。**プレイ可能なゲームサーバーではありません**。取得後はクライアントを切断します。

Rust コアは `src-tauri/skingetbe` に同梱されています。利用やビルドのために上流リポジトリを別途 clone する必要はありません。画面は React・TypeScript・Vite・shadcn/ui で作られています。

> **研究・検証用:** 認証済みの公開サーバーとして運用しないでください。コアは JWT のペイロードを読み取りますが、Login チェーンの署名検証やプレイヤー本人確認は行いません。WebRTC の暗号化と Login 認証は別です。

## 機能と制限

- **サーバー タブ:** NetherNet サーバーの起動・停止、ログの確認。
- **設定 タブ:** バージョン、プロトコル、バインドアドレス、HTTP シグナリングポート、保存モードの編集。`config.jsonc` に保存した後、変更の反映にはサーバーの再起動が必要です。
- **取得したスキン タブ:** PNG 一覧とプレイヤー名・スキン ID（JSON がある場合）・サイズ・更新日時を表示。画像のプレビュー、対応環境での Web Share による共有、デスクトップのファイル管理画面での場所表示に対応。Web Share を使えない場合、デスクトップでは **共有** から PNG を「名前を付けて保存」できます。
- 画面右上の **言語** から日本語・English を切り替えられます。初期表示は日本語で、選択は次回起動時も保持されます。サーバーログと Rust 側のエラー本文は原文のまま表示されます。
- HTTP シグナリングは TCP `port`（初期値 **19132**）、LAN 検出は UDP **7551**。WebRTC は追加の UDP ソケットも使用します。
- 保存モードは `0`（無効）、`1`（上書き）、`2`（重複時に連番）。
- Windows・Linux・macOS と Android 向けのビルド設定があります。Android の実機での通信・共有動作は**未検証**です。ファイル管理画面での場所表示と「名前を付けて保存」はデスクトップ専用です。
- Xbox Live セッション登録、Microsoft 認証済みサーバーとしての運用、ゲームプレイ用のサーバー機能には対応しません。マントやジオメトリは個別ファイルに保存しません。

### 処理の流れ

```text
Minecraft Bedrock → HTTP シグナリング / LAN 検出 → NetherNet（WebRTC）
  → Bedrock Login → スキン抽出 → アプリデータ/skins/<player>_<skinId>.png と .json
  → PlayStatus / Disconnect → セッション終了
```

## インストールと使い方

公開済みの場合は [GitHub Releases](https://github.com/androidprod/SkinGetBE-APP/releases) から各 OS 用ファイルをダウンロードします。Release ワークフローは Windows x64/arm64 用インストーラー・実行ファイル、Linux x64 用 `.deb`・`.AppImage`・実行ファイル、Linux arm64 用 `.deb`・実行ファイル、macOS Intel/Apple Silicon 用 `.dmg`、Android 用の署名済み universal `.apk` と `.aab` を生成します（Android パッケージには arm64、armv7、x86、x64 が含まれます）。Android には `.apk` をインストールし、`.aab` はストア配信用に使用します。Linux の単体実行ファイルには WebKitGTK 等のライブラリが必要です。ダウンロードした実行ファイルや AppImage には `chmod +x` を実行してください。Windows・macOS の配布物はコード署名がないため、OS の警告が表示される場合があります。

アプリで **サーバー → サーバーを起動** を押し、Minecraft Bedrock の LAN 一覧、またはサーバーのアドレスと設定したシグナリングポートを指定して接続します。Login の解析に成功するとクライアントが切断され、**取得したスキン** に PNG が表示されます。ゲームプレイには使えません。

## ソースからビルド

[Node.js 22](https://nodejs.org/) と npm、安定版の [Rust ツールチェーン](https://rustup.rs/)、各 OS の [Tauri 前提ツール](https://v2.tauri.app/start/prerequisites/) をインストールします（Linux では WebKitGTK 4.1 の開発用パッケージ等が必要です）。配布対象の OS 上でビルドしてください。初回ビルド時は Cargo が NetherNet 依存コードを GitHub から取得します。

```bash
npm ci
npm run tauri:dev   # 開発用ウィンドウ
npm run tauri:build # リリース版と OS ごとの配布物
```

フロントエンドと Rust の検証:

```bash
npm run lint
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/skingetbe/Cargo.toml --locked
```

`npm run build` は `dist/` に Web 画面のみを生成します。デスクトップアプリを作る場合は `npm run tauri:build` を使用してください。

## 設定と保存先

初回起動時、GUI は実行ファイルの横ではなく **Tauri のユーザー別アプリデータディレクトリ**に `config.jsonc` を生成します。スキンはその下の `skins/` に保存され、正確なパスは Captured skins タブに表示されます。以前のポータブル版の実行ファイル横に設定や `skins/` がある場合、移行先の設定ファイルまたは `skins/` ディレクトリがまだ存在しないときに限り、それぞれ設定または直下のスキンファイルをコピーします。元ファイルは削除しません。

```json
{
  "version": "1.26.21",
  "protocol": 975,
  "port": 19132,
  "bind_addr": "0.0.0.0",
  "savemode": 2
}
```

| 項目                  | 用途                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `port`                | HTTP シグナリング用の **TCP** ポート（初期値 `19132`）              |
| `bind_addr`           | シグナリングと LAN 検出のバインドアドレス（初期値 `0.0.0.0`）       |
| `protocol`, `version` | 設定上の Bedrock プロトコルとバージョン（初期値 `975` / `1.26.21`） |
| `savemode`            | `0` 保存しない、`1` 上書き、`2` 重複時に連番                        |

JSONC コメントに対応しています。`version` が空、または `protocol` が `0` の場合は読み込み時にコアの最新の値で補完されます。キーを省略した場合は組み込みの初期値が使用されます。**現状の LAN/HTTP 広告では、設定したバージョン・プロトコルではなく、内蔵コアの最新値が使われます。** 画面の設定と広告されるバージョンは異なる場合があります。

上流の **CLI 版**は実行ファイルの横に保存しますが、この **GUI 版**は Tauri のアプリデータに保存します。`skins/Steve_Standard_Steve.png` と対応する `.json` が保存例です。モード `2` の重複時には `_1` のような連番が付きます。プレビューと共有で読み込める PNG は最大 8 MiB です。

## GitHub Releases

GitHub リポジトリにワークフローを push した後、**Actions → Release → Run workflow** を開きます。ブランチとリリースタグ、任意のタイトル、pre-release / draft を指定してください。ワークフローは**手動実行のみ**です。テストと各 OS のビルドが成功した後にタグを作成（または確認）し、配布物付きの GitHub Release を作成します。既存タグは選択したコミットを指す場合のみ使用できます。新しい版を公開する際は `src-tauri/tauri.conf.json` と `src-tauri/Cargo.toml` のバージョンを更新し、インストーラー表記を揃えてください（タグとの自動照合は行いません）。GitHub-hosted runner 上でのワークフロー動作はまだ検証していません。

Android のリリースビルドには、GitHub Actions の Secrets に `ANDROID_KEYSTORE_BASE64`（キーストアの base64 文字列）、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` を設定してください。設定されていない場合、リリースジョブは失敗します。キーストアは `keytool -genkeypair -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload` などで作成し、`base64 -w 0 release.jks`（macOS では `base64 -i release.jks | tr -d '\n'`）の出力を Secret に登録します。秘密鍵・パスワードをリポジトリに追加しないでください。ローカル Android 開発には [Tauri の Android 前提ツール](https://v2.tauri.app/start/prerequisites/) を導入した上で `npm run tauri -- android init`、`npm run tauri -- icon src-tauri/icons/android-icon.json`、`python3 scripts/configure-android-insets.py`、`npm run tauri -- android dev` の順に実行します。Android プロジェクトを再生成した際もアイコン生成とスクリプトを再実行してください。Android のランチャーアイコンは `src-tauri/icons/android/` ではなく、生成された `src-tauri/gen/android/app/src/main/res/mipmap-*/` に配置する必要があります。CI では自動実行します。生成物 `src-tauri/gen/android/` は Git 管理しません。

## トラブルシューティング

- **起動できない:** TCP `port` と UDP `7551` の両方が空いている必要があります。Server タブのログを確認してください。Windows では `Get-NetTCPConnection -LocalPort 19132` と `Get-NetUDPEndpoint -LocalPort 7551` で確認できます。
- **別の端末から接続できない:** 設定した TCP ポートと必要な UDP 通信をファイアウォールで許可してください。WebRTC には動的に割り当てられる UDP ポートもあるため、TCP `19132` だけのポート転送ではインターネット越しの接続は保証されません。まず LAN で確認してください。
- **接続できたがスキンがない:** Server タブの `Detected Player` と保存ログを確認してください。通信接続だけでは Login の解析は完了していません。`savemode` と Captured skins タブに表示される保存先を確認してください。
- **バージョン表記が異なる:** 設定の初期値は `975 / 1.26.21` ですが、現行の内蔵コアが広告する最新の対応表は `2225 / 26.60` です。画面の値を変えても広告値の選び方は変わりません。
- **共有・保存場所の表示が使えない:** Web Share は環境依存です。デスクトップでは「名前を付けて保存」に切り替わります。Android/iOS ではファイル管理画面での場所表示は利用できません。Android の動作自体も未保証です。

## 主な構成

| パス                            | 役割                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| `src/App.tsx`                   | Server・Settings・Captured skins の画面                          |
| `src-tauri/src/main.rs`         | Tauri コマンド、アプリデータ・設定パス、スキン一覧とファイル操作 |
| `src-tauri/src/nethernet.rs`    | NetherNet リスナー、Bedrock セッション、スキン保存               |
| `src-tauri/skingetbe/`          | 内蔵 Rust コア（Bedrock 解析、スキン抽出、旧 RakNet コード）     |
| `src-tauri/tauri.conf.json`     | Tauri ウィンドウ、アプリ識別子、配布設定                         |
| `.github/workflows/release.yml` | 手動実行のマルチ OS ビルド・テスト・リリース                     |

## 参考資料・ライセンス

- [SkinGetBE-Rust](https://github.com/androidprod/SkinGetBE-Rust) · [NetherNet 実装](https://github.com/bedrock-crustaceans/nethernet) · [Tauri ドキュメント](https://v2.tauri.app/)
- 同梱の SkinGetBE-Rust コアには [MIT License](src-tauri/skingetbe/LICENSE) が含まれます。このリポジトリには GUI 全体の独立したライセンスファイルはありません。
