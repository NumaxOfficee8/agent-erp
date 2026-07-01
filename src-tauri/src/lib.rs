use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Emitter};
use tauri::http::Response;

mod downloader;

#[derive(serde::Serialize, Clone)]
pub struct ChatResponseChunk {
    pub token: String,
    pub done: bool,
}

// Locate SQLite DB path in secure AppData folder
fn get_db_path(app_handle: &AppHandle) -> PathBuf {
    let mut path = app_handle.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path.push("agent_erp.db");
    path
}

// Database Initialization (SQLite)
fn init_db(app_handle: &AppHandle) -> Result<(), String> {
    let db_path = get_db_path(app_handle);
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS modules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            file_path TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            workspace TEXT NOT NULL,
            installed_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create modules table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS mirrored_orders (
            so_id TEXT PRIMARY KEY,
            customer_name TEXT NOT NULL,
            po_reference TEXT NOT NULL,
            items_json TEXT NOT NULL,
            total_amount REAL NOT NULL,
            profit_margin REAL NOT NULL,
            capacity_usage REAL NOT NULL,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create mirrored_orders table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            action_type TEXT NOT NULL,
            arguments TEXT NOT NULL,
            decision TEXT NOT NULL,
            operator TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create audit_logs table: {}", e))?;

    // Seed mock order if empty
    let mut stmt = conn.prepare("SELECT count(*) FROM mirrored_orders").map_err(|e| e.to_string())?;
    let count: i64 = stmt.query_row([], |row| row.get(0)).unwrap_or(0);
    if count == 0 {
        conn.execute(
            "INSERT INTO mirrored_orders (so_id, customer_name, po_reference, items_json, total_amount, profit_margin, capacity_usage, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            (
                "SO-9921",
                "A 公司 (Customer A)",
                "PO-2026-0091",
                r#"[{"name": "智能核心晶片 (AI Core Chip)", "qty": 500, "price": 120}]"#,
                60000.0,
                0.25,
                0.85,
                "pending",
                1782825600i64
            )
        ).map_err(|e| format!("Failed to seed order: {}", e))?;
    }

    Ok(())
}

// 1. Chat Streaming Simulator Command (via Tauri Channels)
// Removed 'pub' to resolve E0255 re-import macro name collisions in lib.rs
#[tauri::command]
async fn simulate_agent_chat(
    workspace: String,
    _message: String,
    channel: tauri::ipc::Channel<ChatResponseChunk>
) -> Result<(), String> {
    tokio::spawn(async move {
        let response_text = match workspace.as_str() {
            "finance" => "Finance BI Dashboard Analyzed:\n- Current gross margin is 25.4%.\n- Target is 25.0%.\n- Recommendation: Approve Customer A's PO-2026-0092 to leverage idle capacity and hit Q3 goals.",
            "crm" => "Customer CRM Profiler:\n- Customer A has a credit rating of AAA.\n- Past ledger defaults: None.\n- Delivery success rate: 100%.\n- Recommendation: Proceed to process the order immediately.",
            _ => "Sales Workspace Context Loaded:\n- Product: AI Core Chip.\n- Mirrored Draft: SO-9922.\n- Current Action Required: Request Peter's authorization to execute database writes and sync invoice."
        };

        // Split text by space and stream back
        let words: Vec<&str> = response_text.split_whitespace().collect();
        for (i, word) in words.iter().enumerate() {
            let is_last = i == words.len() - 1;
            let chunk = ChatResponseChunk {
                token: format!("{} ", word),
                done: is_last,
            };
            let _ = channel.send(chunk);
            tokio::time::sleep(tokio::time::Duration::from_millis(60)).await;
        }
    });
    Ok(())
}

// 2. Webhook order mirroring simulator command
// Removed 'pub' to resolve E0255 re-import macro name collisions in lib.rs
#[tauri::command]
async fn simulate_webhook_order(app_handle: AppHandle) -> Result<(), String> {
    let db_path = get_db_path(&app_handle);
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    // Clear previous simulation to support multiple testing runs
    let _ = conn.execute("DELETE FROM mirrored_orders WHERE so_id = 'SO-9922'", []);

    // Insert order draft
    conn.execute(
        "INSERT INTO mirrored_orders (so_id, customer_name, po_reference, items_json, total_amount, profit_margin, capacity_usage, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        (
            "SO-9922",
            "A 公司 (Customer A)",
            "PO-2026-0092",
            r#"[{"name": "智能核心晶片 (AI Core Chip)", "qty": 500, "price": 120}]"#,
            60000.0,
            0.25,
            0.85,
            "pending",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64
        )
    ).map_err(|e| e.to_string())?;

    // Wait 1.5 seconds, then emit Tauri event to trigger native OS/In-app alerts
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
        let _ = app_clone.emit(
            "notification-hub",
            serde_json::json!({
                "id": "SO-9922",
                "title": "A 公司採購單已送入",
                "message": "系統已建立孿生訂單 SO-9922，等待 Peter 審核。",
                "workspace": "sales"
            }),
        );
    });

    Ok(())
}

// 3. Mutation Interceptor Command
// Removed 'pub' to resolve E0255 re-import macro name collisions in lib.rs
#[tauri::command]
async fn confirm_mutation(app_handle: AppHandle, mutation_id: String, approved: bool) -> Result<(), String> {
    let db_path = get_db_path(&app_handle);
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let status = if approved { "approved" } else { "rejected" };
    
    // Update local ledger status
    conn.execute(
        "UPDATE mirrored_orders SET status = ?1 WHERE so_id = ?2",
        (status, &mutation_id),
    ).map_err(|e| e.to_string())?;

    // Write audit log trail
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let log_id = format!("LOG-{}", timestamp);

    conn.execute(
        "INSERT INTO audit_logs (id, action_type, arguments, decision, operator, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &log_id,
            "confirm_order",
            format!(r#"{{"so_id": "{}"}}"#, mutation_id),
            status,
            "Peter",
            timestamp
        ),
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// 4. Data query endpoints
// Removed 'pub' to resolve E0255 re-import macro name collisions in lib.rs
#[tauri::command]
async fn get_mirrored_orders(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    let db_path = get_db_path(&app_handle);
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT so_id, customer_name, po_reference, items_json, total_amount, profit_margin, capacity_usage, status, created_at FROM mirrored_orders ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "so_id": row.get::<_, String>(0)?,
            "customer_name": row.get::<_, String>(1)?,
            "po_reference": row.get::<_, String>(2)?,
            "items": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(3)?).unwrap_or(serde_json::json!([])),
            "total_amount": row.get::<_, f64>(4)?,
            "profit_margin": row.get::<_, f64>(5)?,
            "capacity_usage": row.get::<_, f64>(6)?,
            "status": row.get::<_, String>(7)?,
            "created_at": row.get::<_, i64>(8)?,
        }))
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(val) = r {
            list.push(val);
        }
    }
    Ok(serde_json::json!(list))
}

// Removed 'pub' to resolve E0255 re-import macro name collisions in lib.rs
#[tauri::command]
async fn get_audit_logs(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    let db_path = get_db_path(&app_handle);
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, action_type, arguments, decision, operator, timestamp FROM audit_logs ORDER BY timestamp DESC").map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "action_type": row.get::<_, String>(1)?,
            "arguments": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(2)?).unwrap_or(serde_json::json!({})),
            "decision": row.get::<_, String>(3)?,
            "operator": row.get::<_, String>(4)?,
            "timestamp": row.get::<_, i64>(5)?,
        }))
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(val) = r {
            list.push(val);
        }
    }
    Ok(serde_json::json!(list))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle();
            // Initialize local database
            init_db(app_handle).expect("Failed to initialize SQLite Database");
            Ok(())
        })
        .register_uri_scheme_protocol("app-module", |ctx, request| {
            // Retrieve AppHandle from the UriSchemeContext in Tauri v2
            let app_handle = ctx.app_handle();
            let path = request.uri().path();
            // Clean dynamic module route
            let path = path.trim_start_matches('/');
            
            // Map protocol request to AppData/modules/ directory
            let mut file_path = app_handle.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("data"));
            file_path.push(path);

            if !file_path.exists() {
                return Response::builder().status(404).body(Vec::new()).unwrap();
            }

            // Determine mime type based on extension
            let mime_type = if file_path.to_string_lossy().ends_with(".js") {
                "application/javascript"
            } else if file_path.to_string_lossy().ends_with(".html") {
                "text/html"
            } else {
                "application/octet-stream"
            };

            // Read module payload
            match fs::read(&file_path) {
                Ok(data) => Response::builder()
                    .status(200)
                    .header("Content-Type", mime_type)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(data)
                    .unwrap(),
                Err(_) => Response::builder().status(500).body(Vec::new()).unwrap(),
            }
        })
        .invoke_handler(tauri::generate_handler![
            simulate_agent_chat,
            simulate_webhook_order,
            confirm_mutation,
            get_mirrored_orders,
            get_audit_logs,
            downloader::download_module,
            downloader::get_installed_modules
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
