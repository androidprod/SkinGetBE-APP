use crate::append_log;
use anyhow::Result;
use nethernet_tokio::signaling::http::{HttpServerConfig, HttpSignalingServer};
use nethernet_tokio::signaling::lan::LanSignaling;
use nethernet_tokio::{
    AcceptedSession, ConnectionConfig, NetherServer, ServerData, ServerIdentity,
};
use skingetbe::util::{Buffer, Config};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, SystemTime};

pub async fn run_server(
    config: Config,
    data_dir: PathBuf,
    shutdown: Arc<AtomicBool>,
    logs: Arc<Mutex<Vec<String>>>,
) -> Result<()> {
    let network_id = rand::random::<u64>();
    let bind_addr = format!("{}:{}", config.bind_addr, config.port).parse()?;
    let signaling = HttpSignalingServer::bind(
        bind_addr,
        HttpServerConfig {
            network_id: network_id.to_string(),
            ..Default::default()
        },
    )
    .await?;
    let lan_addr = format!("{}:7551", config.bind_addr).parse()?;
    let lan_signaling = LanSignaling::new(network_id, lan_addr).await?;

    let mut data = ServerData::new(
        "SkinGetBE NetherNet Server".to_string(),
        "Skin Capture".to_string(),
    );
    data.protocol_version = skingetbe::bedrock::get_latest_protocol() as u32;
    data.game_version = skingetbe::bedrock::get_latest_version();
    data.player_count = 0;
    data.max_player_count = 1;
    signaling.set_server_data(data.clone());
    lan_signaling.set_server_data(data);

    let identity = ServerIdentity::generate("SkinGetBE", SystemTime::now())?;
    let connection = ConnectionConfig {
        identity: Some(Arc::new(identity)),
        ..Default::default()
    };
    let mut http_listener = NetherServer::bind_with(signaling, connection.clone()).await?;
    let mut lan_listener = NetherServer::bind_with(lan_signaling, connection).await?;
    append_log(&logs, format!("NetherNet HTTP signaling: {bind_addr}"));
    append_log(&logs, format!("NetherNet LAN discovery: {lan_addr}"));
    append_log(&logs, format!("Network ID: {network_id}"));

    let config = Arc::new(config);
    let data_dir = Arc::new(data_dir);
    while !shutdown.load(Ordering::Relaxed) {
        tokio::select! {
            result = http_listener.accept() => {
                match result {
                    Ok(accepted) => spawn_session(accepted, config.clone(), data_dir.clone(), logs.clone()),
                    Err(error) => append_log(&logs, format!("HTTP accept error: {error}")),
                }
            }
            result = lan_listener.accept() => {
                match result {
                    Ok(accepted) => spawn_session(accepted, config.clone(), data_dir.clone(), logs.clone()),
                    Err(error) => append_log(&logs, format!("LAN accept error: {error}")),
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(100)) => {}
        }
    }
    Ok(())
}

fn spawn_session(
    accepted: AcceptedSession,
    config: Arc<Config>,
    data_dir: Arc<PathBuf>,
    logs: Arc<Mutex<Vec<String>>>,
) {
    tokio::spawn(async move {
        if let Err(error) = handle_session(accepted, config, data_dir, logs.clone()).await {
            append_log(&logs, format!("Session error: {error}"));
        }
    });
}

async fn handle_session(
    accepted: AcceptedSession,
    config: Arc<Config>,
    data_dir: Arc<PathBuf>,
    logs: Arc<Mutex<Vec<String>>>,
) -> Result<()> {
    let AcceptedSession {
        session,
        mut reliable,
        mut unreliable,
        ..
    } = accepted;
    let mut compression_enabled = false;
    let mut reliable_open = true;
    let mut unreliable_open = true;

    while reliable_open || unreliable_open {
        let data = tokio::select! {
            result = reliable.recv(), if reliable_open => {
                match result? {
                    Some(data) => Some(data),
                    None => { reliable_open = false; None }
                }
            }
            result = unreliable.recv(), if unreliable_open => {
                match result? {
                    Some(data) => Some(data),
                    None => { unreliable_open = false; None }
                }
            }
        };
        let Some(data) = data else { continue };
        let bytes = data.to_vec();
        if bytes.is_empty() {
            continue;
        }
        // NetherNet has no RakNet batch marker; accept legacy-prefixed packets.
        let payload = if bytes[0] == 0xfe {
            &bytes[1..]
        } else {
            &bytes[..]
        };
        let decompressed = match skingetbe::bedrock::decompress_batch(payload, compression_enabled)
        {
            Ok(data) => data,
            Err(error) => {
                append_log(&logs, format!("Invalid Bedrock batch: {error}"));
                continue;
            }
        };
        for packet in skingetbe::bedrock::parse_batch(&decompressed).unwrap_or_default() {
            if packet.is_empty() {
                continue;
            }
            let mut buffer = Buffer::from(&packet);
            let packet_id = buffer.read_var_int().unwrap_or(packet[0] as u32);
            match packet_id {
                0xc1 => {
                    let protocol = buffer.read_u32().unwrap_or(config.protocol as u32);
                    append_log(
                        &logs,
                        format!(
                            "RequestNetworkSettings: {} ({})",
                            protocol,
                            skingetbe::bedrock::resolve_version(protocol)
                        ),
                    );
                    compression_enabled = true;
                    let response =
                        build_batch(&[skingetbe::bedrock::build_network_settings()], false)?;
                    session.send(response.into()).await?;
                }
                0x01 => {
                    let remaining = buffer.read_remaining();
                    if let Ok(Some(parsed)) =
                        skingetbe::bedrock::login::parse_login_packet(&remaining)
                    {
                        append_log(&logs, format!("Detected Player: {}", parsed.player_name));
                        match skingetbe::bedrock::skin::ExtractedSkin::new(
                            parsed.skin_width,
                            parsed.skin_height,
                            parsed.skin_data.clone(),
                        ) {
                            Ok(skin) => match skingetbe::bedrock::skin::save_login_capture(
                                &data_dir,
                                &parsed.player_name,
                                &parsed.skin_id,
                                &parsed.metadata,
                                &skin,
                                config.savemode,
                            ) {
                                Ok(_) => append_log(
                                    &logs,
                                    format!("Skin saved for {}", parsed.player_name),
                                ),
                                Err(error) => append_log(&logs, format!("Save failed: {error}")),
                            },
                            Err(error) => {
                                append_log(&logs, format!("Skin validation failed: {error}"))
                            }
                        }
                        let response = build_batch(
                            &[
                                skingetbe::bedrock::build_play_status(0),
                                skingetbe::bedrock::build_disconnect(0, "Skin captured"),
                            ],
                            compression_enabled,
                        )?;
                        session.send(response.into()).await?;
                        tokio::time::sleep(Duration::from_millis(500)).await;
                        let _ = session.close().await;
                        return Ok(());
                    }
                }
                _ => {}
            }
        }
    }
    Ok(())
}

fn build_batch(packets: &[Vec<u8>], compression_enabled: bool) -> Result<Vec<u8>> {
    let mut combined = Buffer::new();
    for packet in packets {
        combined.write_var_int(packet.len() as u32)?;
        combined.write_bytes(packet)?;
    }
    let bytes = combined.to_vec();
    if compression_enabled {
        Ok(skingetbe::bedrock::compress_batch(&bytes)?)
    } else {
        Ok(bytes)
    }
}
