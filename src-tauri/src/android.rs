use serde::Serialize;
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    AppHandle, Manager, Runtime,
};

type ShutdownSlot = Arc<Mutex<Option<Arc<AtomicBool>>>>;
static SHUTDOWN: OnceLock<ShutdownSlot> = OnceLock::new();

struct AndroidBridge<R: Runtime>(PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("skingetbe-android")
        .setup(|app, api| {
            let bridge = api.register_android_plugin("com.skingetbe.gui", "SkinGetPlugin")?;
            app.manage(AndroidBridge(bridge));
            Ok(())
        })
        .build()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SkinArg<'a> {
    path: &'a str,
    file_name: &'a str,
}

fn send_skin(app: &AppHandle, command: &str, path: &Path, file_name: &str) -> Result<(), String> {
    let path = path.to_str().ok_or("invalid skin path")?;
    app.state::<AndroidBridge>()
        .0
        .run_mobile_plugin::<()>(command, SkinArg { path, file_name })
        .map_err(|error| error.to_string())
}

pub fn share_skin(app: &AppHandle, path: &Path, file_name: &str) -> Result<(), String> {
    send_skin(app, "shareSkin", path, file_name)
}

pub fn save_skin(app: &AppHandle, path: &Path, file_name: &str) -> Result<bool, String> {
    let path = path.to_str().ok_or("invalid skin path")?;
    #[derive(serde::Deserialize)]
    struct SaveResult {
        saved: bool,
    }
    app.state::<AndroidBridge>()
        .0
        .run_mobile_plugin::<SaveResult>("saveSkin", SkinArg { path, file_name })
        .map(|result| result.saved)
        .map_err(|error| error.to_string())
}

pub fn start_notification(
    app: &AppHandle,
    english: bool,
    shutdown: &ShutdownSlot,
) -> Result<(), String> {
    let _ = SHUTDOWN.set(Arc::clone(shutdown));
    app.state::<AndroidBridge>()
        .0
        .run_mobile_plugin::<()>(
            "startServerNotification",
            serde_json::json!({ "english": english }),
        )
        .map_err(|error| error.to_string())
}

// Called directly from the Android foreground service, even when the WebView is paused.
#[no_mangle]
pub extern "system" fn Java_com_skingetbe_gui_ServerService_nativeRequestStop(
    _env: *mut std::ffi::c_void,
    _service: *mut std::ffi::c_void,
) {
    if let Some(slot) = SHUTDOWN.get() {
        if let Ok(active) = slot.lock() {
            if let Some(flag) = active.as_ref() {
                flag.store(true, Ordering::Relaxed);
            }
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_skingetbe_gui_ServerService_nativeIsRunning(
    _env: *mut std::ffi::c_void,
    _service: *mut std::ffi::c_void,
) -> u8 {
    SHUTDOWN
        .get()
        .and_then(|slot| slot.lock().ok())
        .is_some_and(|active| active.is_some()) as u8
}
