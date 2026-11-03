slint::include_modules!();

use anyhow::{anyhow, Context, Result};
use skingetbe::{
    network::{Network, NetworkConfig},
    raknet::{RakNetConfig, RakNetServer},
    util::{Config, ConfigManager, StunClient},
};
use slint::SharedString;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
};

fn main() -> Result<()> {
    let ui = MainWindow::new()?;
    let config_path = config_path()?;
    let config_manager = ConfigManager::new(&config_path);
    let config = config_manager.load().context("failed to load config")?;

    ui.set_version(config.version.clone().into());
    ui.set_protocol(config.protocol.to_string().into());
    ui.set_port(config.port.to_string().into());
    ui.set_bind_addr(config.bind_addr.clone().into());
    ui.set_save_mode(config.savemode.to_string().into());
    ui.set_status("Stopped".into());
    ui.set_log_text(format!("Config: {}\n", config_path.display()).into());

    let active_shutdown: Arc<std::sync::Mutex<Option<Arc<AtomicBool>>>> =
        Arc::new(std::sync::Mutex::new(None));

    {
        let ui_handle = ui.as_weak();
        let config_path = config_path.clone();
        ui.on_save_config(move || {
            let Some(ui) = ui_handle.upgrade() else {
                return;
            };
            match read_config_from_ui(&ui, &config_path) {
                Ok(_) => append_log(&ui, "Configuration saved.".to_string()),
                Err(error) => append_log(&ui, format!("ERROR: {error}")),
            }
        });
    }

    {
        let ui_handle = ui.as_weak();
        let active_shutdown = active_shutdown.clone();
        let config_path = config_path.clone();
        ui.on_start_server(move || {
            let Some(ui) = ui_handle.upgrade() else {
                return;
            };
            let config = match read_config_from_ui(&ui, &config_path) {
                Ok(config) => config,
                Err(error) => {
                    append_log(&ui, format!("ERROR: {error}"));
                    return;
                }
            };

            let shutdown = Arc::new(AtomicBool::new(false));
            *active_shutdown.lock().expect("shutdown mutex poisoned") = Some(shutdown.clone());
            ui.set_running(true);
            ui.set_status("Starting...".into());
            append_log(
                &ui,
                format!(
                    "Starting UDP server on {}:{}",
                    config.bind_addr, config.port
                ),
            );

            let ui_handle = ui.as_weak();
            thread::spawn(move || {
                let result = match tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build()
                {
                    Ok(runtime) => runtime.block_on(run_server(config, shutdown)),
                    Err(error) => Err(anyhow!(error)),
                };

                let message = match result {
                    Ok(()) => "Server stopped.".to_string(),
                    Err(error) => format!("ERROR: {error:#}"),
                };
                let _ = slint::invoke_from_event_loop(move || {
                    if let Some(ui) = ui_handle.upgrade() {
                        ui.set_running(false);
                        ui.set_status("Stopped".into());
                        append_log(&ui, message);
                    }
                });
            });
        });
    }

    {
        let ui_handle = ui.as_weak();
        let active_shutdown = active_shutdown.clone();
        ui.on_stop_server(move || {
            if let Some(shutdown) = active_shutdown
                .lock()
                .expect("shutdown mutex poisoned")
                .take()
            {
                shutdown.store(true, Ordering::Relaxed);
                if let Some(ui) = ui_handle.upgrade() {
                    ui.set_status("Stopping...".into());
                    append_log(&ui, "Shutdown requested.".to_string());
                }
            }
        });
    }

    ui.run()?;
    Ok(())
}

fn config_path() -> Result<PathBuf> {
    let executable = std::env::current_exe()?;
    let directory = executable
        .parent()
        .ok_or_else(|| anyhow!("could not determine executable directory"))?;
    Ok(directory.join("config.jsonc"))
}

fn read_config_from_ui(ui: &MainWindow, config_path: &PathBuf) -> Result<Config> {
    let config = Config {
        version: ui.get_version().to_string(),
        protocol: parse_u16("protocol", ui.get_protocol().as_str())?,
        port: parse_u16("port", ui.get_port().as_str())?,
        bind_addr: ui.get_bind_addr().to_string(),
        savemode: parse_u8("save mode", ui.get_save_mode().as_str())?.min(2),
    };
    ConfigManager::new(config_path).save(&config)?;
    Ok(config)
}

fn parse_u16(name: &str, value: &str) -> Result<u16> {
    value
        .trim()
        .parse()
        .with_context(|| format!("{name} must be a valid number"))
}

fn parse_u8(name: &str, value: &str) -> Result<u8> {
    value
        .trim()
        .parse()
        .with_context(|| format!("{name} must be a valid number"))
}

fn append_log(ui: &MainWindow, line: String) {
    let current = ui.get_log_text().to_string();
    let next = if current.is_empty() {
        line
    } else {
        format!("{current}{line}\n")
    };
    ui.set_log_text(SharedString::from(next));
}

async fn run_server(config: Config, shutdown: Arc<AtomicBool>) -> Result<()> {
    let network_config = NetworkConfig {
        bind_addr: config.bind_addr.clone(),
        bind_port: config.port,
    };
    let mut network = Network::new(network_config);
    network.bind().await.context("failed to bind server")?;

    let external_ip = StunClient::new(5000)
        .discover_external_ip(&network.get_socket())
        .await;
    let raknet_config = RakNetConfig {
        server_guid: 0x1234567812345678,
        protocol_version: config.protocol,
        mtu_size: 1492,
        server_port: config.port,
        version: config.version,
        external_addr: Some(external_ip),
        savemode: config.savemode,
    };
    let server = Arc::new(RakNetServer::new(
        Arc::new(network.get_socket()),
        raknet_config,
        Some(shutdown.clone()),
    ));
    let mut buffer = vec![0_u8; 65535];

    while !shutdown.load(Ordering::Relaxed) {
        tokio::select! {
            result = network.recv_from(&mut buffer) => {
                if let Ok((size, address)) = result {
                    let _ = server.handle_packet(&buffer[..size], address).await;
                }
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(100)) => {}
        }
    }

    Ok(())
}
