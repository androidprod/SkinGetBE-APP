use anyhow::{bail, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use skingetbe::util::{Config, ConfigManager};
use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

mod nethernet;

struct AppState {
    shutdown: Arc<Mutex<Option<Arc<AtomicBool>>>>,
    logs: Arc<Mutex<Vec<String>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServerState {
    running: bool,
    logs: String,
}

#[derive(Serialize)]
struct SavedSkin {
    file_name: String,
    player_name: Option<String>,
    skin_id: Option<String>,
    size_bytes: u64,
    modified: Option<u64>,
}

#[derive(Serialize)]
struct SkinList {
    directory: String,
    skins: Vec<SavedSkin>,
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf> {
    let directory = app.path().app_data_dir()?;
    fs::create_dir_all(&directory)?;

    // Copy old portable-install files once, without modifying or replacing them.
    if let Some(legacy) = std::env::current_exe()?.parent() {
        let old_config = legacy.join("config.jsonc");
        let new_config = directory.join("config.jsonc");
        if old_config.is_file() && !new_config.exists() {
            fs::copy(old_config, new_config)?;
        }
        let old_skins = legacy.join("skins");
        let new_skins = directory.join("skins");
        if old_skins.is_dir() && !new_skins.exists() {
            fs::create_dir_all(&new_skins)?;
            for entry in fs::read_dir(old_skins)? {
                let entry = entry?;
                if entry.file_type()?.is_file() {
                    let target = new_skins.join(entry.file_name());
                    if !target.exists() {
                        fs::copy(entry.path(), target)?;
                    }
                }
            }
        }
    }
    Ok(directory)
}

#[tauri::command]
fn load_config(app: tauri::AppHandle) -> Result<Config, String> {
    ConfigManager::new(
        data_dir(&app)
            .map_err(|error| error.to_string())?
            .join("config.jsonc"),
    )
    .load()
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_config(config: Config, app: tauri::AppHandle) -> Result<(), String> {
    ConfigManager::new(
        data_dir(&app)
            .map_err(|error| error.to_string())?
            .join("config.jsonc"),
    )
    .save(&config)
    .map_err(|error| error.to_string())
}

fn collect_skins(directory: &std::path::Path) -> Result<Vec<SavedSkin>> {
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut skins = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if !entry.file_type()?.is_file()
            || !entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("png"))
        {
            continue;
        }
        let metadata = entry.metadata()?;
        let sidecar = entry.path().with_extension("json");
        let details = fs::metadata(&sidecar)
            .ok()
            .filter(|m| m.len() <= 256 * 1024)
            .and_then(|_| fs::read(sidecar).ok())
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
        skins.push(SavedSkin {
            file_name: entry.file_name().to_string_lossy().into_owned(),
            player_name: details
                .as_ref()
                .and_then(|v| v["player_name"].as_str())
                .map(str::to_owned),
            skin_id: details
                .as_ref()
                .and_then(|v| v["skin_id"].as_str())
                .map(str::to_owned),
            size_bytes: metadata.len(),
            modified: metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs()),
        });
    }
    skins.sort_by(|a, b| {
        b.modified
            .cmp(&a.modified)
            .then_with(|| a.file_name.cmp(&b.file_name))
    });
    Ok(skins)
}

#[tauri::command]
fn list_skins(app: tauri::AppHandle) -> Result<SkinList, String> {
    let directory = data_dir(&app)
        .map_err(|error| error.to_string())?
        .join("skins");
    let skins = collect_skins(&directory).map_err(|error| error.to_string())?;
    Ok(SkinList {
        directory: directory.display().to_string(),
        skins,
    })
}

// Only single PNG file names from the app's skins directory may be accessed.
fn skin_path(directory: &std::path::Path, file_name: &str) -> Result<PathBuf> {
    use std::path::Component;

    let mut components = std::path::Path::new(file_name).components();
    if !matches!(components.next(), Some(Component::Normal(_)))
        || components.next().is_some()
        || file_name.contains(['/', '\\', ':'])
        || !file_name.to_ascii_lowercase().ends_with(".png")
    {
        bail!("invalid skin file name");
    }
    let path = directory.join(file_name);
    if !fs::symlink_metadata(&path)?.file_type().is_file() {
        bail!("skin file is not a regular file");
    }
    Ok(path)
}

#[tauri::command]
fn read_skin(file_name: String, app: tauri::AppHandle) -> Result<String, String> {
    let directory = data_dir(&app)
        .map_err(|error| error.to_string())?
        .join("skins");
    let path = skin_path(&directory, &file_name).map_err(|error| error.to_string())?;
    let size = fs::metadata(&path)
        .map_err(|error| error.to_string())?
        .len();
    if size > 8 * 1024 * 1024 {
        return Err("skin image is too large to preview or share".into());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("skin image is not a PNG".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn reveal_skin(file_name: String, app: tauri::AppHandle) -> Result<(), String> {
    let directory = data_dir(&app)
        .map_err(|error| error.to_string())?
        .join("skins");
    let path = skin_path(&directory, &file_name).map_err(|error| error.to_string())?;
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    return tauri_plugin_opener::reveal_item_in_dir(path).map_err(|error| error.to_string());
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = path;
        Err("opening a file in the file manager is not supported on mobile".into())
    }
}

// When Web Share is unavailable, open a native Save As dialog so the PNG can
// still be sent through the user's preferred desktop application.
#[tauri::command]
async fn export_skin(file_name: String, app: tauri::AppHandle) -> Result<Option<String>, String> {
    let directory = data_dir(&app)
        .map_err(|error| error.to_string())?
        .join("skins");
    let path = skin_path(&directory, &file_name).map_err(|error| error.to_string())?;
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    return tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>> {
        let selected = app
            .dialog()
            .file()
            .set_file_name(&file_name)
            .add_filter("PNG image", &["png"])
            .blocking_save_file();
        let Some(destination) = selected else {
            return Ok(None);
        };
        let destination = destination.into_path()?;
        if destination
            .extension()
            .and_then(|ext| ext.to_str())
            .is_none_or(|ext| !ext.eq_ignore_ascii_case("png"))
        {
            bail!("destination must be a PNG file");
        }
        if destination != path {
            fs::copy(path, &destination)?;
        }
        Ok(Some(destination.display().to_string()))
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string());
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (path, app);
        Err("save as is not supported on mobile; use the system share menu".into())
    }
}

#[tauri::command]
fn server_state(state: tauri::State<'_, AppState>) -> ServerState {
    let running = state
        .shutdown
        .lock()
        .map(|value| value.is_some())
        .unwrap_or(false);
    let logs = state
        .logs
        .lock()
        .map(|lines| lines.join("\n") + "\n")
        .unwrap_or_default();
    ServerState { running, logs }
}

#[tauri::command]
fn start_server(
    config: Config,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let directory = data_dir(&app).map_err(|error| error.to_string())?;
    let mut slot = state
        .shutdown
        .lock()
        .map_err(|_| "shutdown state is unavailable".to_string())?;
    if slot.is_some() {
        return Ok(());
    }

    let shutdown = Arc::new(AtomicBool::new(false));
    *slot = Some(shutdown.clone());
    drop(slot);

    let logs = Arc::clone(&state.logs);
    let shutdown_slot = Arc::clone(&state.shutdown);
    append_log(
        &logs,
        format!(
            "Starting NetherNet server on {}:{}",
            config.bind_addr, config.port
        ),
    );
    std::thread::spawn(move || {
        let result = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .map_err(anyhow::Error::from)
            .and_then(|runtime| {
                runtime.block_on(nethernet::run_server(
                    config,
                    directory,
                    shutdown.clone(),
                    logs.clone(),
                ))
            });
        if let Err(error) = result {
            append_log(&logs, format!("ERROR: {error:#}"));
        }
        if let Ok(mut current) = shutdown_slot.lock() {
            if current
                .as_ref()
                .is_some_and(|active| Arc::ptr_eq(active, &shutdown))
            {
                current.take();
            }
        }
        append_log(&logs, "Server stopped.".to_string());
    });

    Ok(())
}

#[tauri::command]
fn stop_server(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(shutdown) = state
        .shutdown
        .lock()
        .map_err(|_| "shutdown state is unavailable".to_string())?
        .as_ref()
    {
        shutdown.store(true, Ordering::Relaxed);
        append_log(&state.logs, "Shutdown requested.".to_string());
    }
    Ok(())
}

pub(crate) fn append_log(logs: &Mutex<Vec<String>>, line: String) {
    if let Ok(mut entries) = logs.lock() {
        entries.push(line);
        if entries.len() > 500 {
            let remove_count = entries.len() - 500;
            entries.drain(..remove_count);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            shutdown: Arc::new(Mutex::new(None)),
            logs: Arc::new(Mutex::new(Vec::new())),
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            server_state,
            start_server,
            stop_server,
            list_skins,
            read_skin,
            reveal_skin,
            export_skin
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skin_list_reads_png_and_optional_sidecar() {
        let directory =
            std::env::temp_dir().join(format!("skingetbe-gui-test-{}", rand::random::<u64>()));
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("Steve_skin.png"), b"png").unwrap();
        fs::write(
            directory.join("Steve_skin.json"),
            br#"{"player_name":"Steve","skin_id":"skin"}"#,
        )
        .unwrap();
        fs::write(directory.join("other.txt"), b"not a skin").unwrap();

        let skins = collect_skins(&directory).unwrap();
        assert_eq!(skins.len(), 1);
        assert_eq!(skins[0].file_name, "Steve_skin.png");
        assert_eq!(skins[0].player_name.as_deref(), Some("Steve"));
        assert_eq!(skins[0].skin_id.as_deref(), Some("skin"));
        assert_eq!(skins[0].size_bytes, 3);

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn skin_path_rejects_traversal_and_non_png_files() {
        let directory =
            std::env::temp_dir().join(format!("skingetbe-path-test-{}", rand::random::<u64>()));
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("Steve.PNG"), b"png").unwrap();
        assert!(skin_path(&directory, "Steve.PNG").is_ok());
        for name in [
            "../Steve.PNG",
            "..\\Steve.PNG",
            "other.txt",
            "C:Steve.png",
            "sub/Steve.png",
        ] {
            assert!(skin_path(&directory, name).is_err(), "{name}");
        }
        fs::remove_dir_all(directory).unwrap();
    }
}
