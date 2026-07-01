use std::fs;
use std::path::{Path, PathBuf};
use sha2::{Sha256, Digest};
use tauri::{AppHandle, Manager};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ModuleMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub file_path: String,
    pub sha256: String,
    pub workspace: String,
}

// Locate the local Mock CDN folder containing build templates
fn get_mock_cdn_dir(app_handle: &AppHandle) -> PathBuf {
    let cwd_cdn = PathBuf::from("mock_cdn");
    if cwd_cdn.exists() {
        return cwd_cdn;
    }
    // Fallback in packaged standalone environments
    app_handle.path().resource_dir().unwrap_or_else(|_| PathBuf::from(".")).join("mock_cdn")
}

// Get the secure local modules directory in the AppData path
fn get_modules_target_dir(app_handle: &AppHandle) -> PathBuf {
    let mut path = app_handle.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("data"));
    path.push("modules");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
}

fn calculate_sha256(path: &Path) -> Result<String, String> {
    let content = fs::read(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(&content);
    let result = hasher.finalize();
    Ok(hex::encode(result))
}

#[tauri::command]
pub async fn download_module(app_handle: AppHandle, module_id: String) -> Result<ModuleMetadata, String> {
    let cdn_dir = get_mock_cdn_dir(&app_handle);
    let target_dir = get_modules_target_dir(&app_handle);
    
    // Module ID matches: 'sales_bi' -> JS module, 'crm' -> HTML iframe sub-app
    let is_js = module_id == "sales_bi";
    let filename = if is_js {
        "sales_bi_module.js"
    } else {
        "crm_dashboard.html"
    };
    
    let source_file = cdn_dir.join(filename);
    let target_file = target_dir.join(filename);
    
    if !source_file.exists() {
        return Err(format!("CDN source file not found at: {:?}", source_file));
    }
    
    // Copy asset
    fs::copy(&source_file, &target_file).map_err(|e| format!("Failed to copy file: {}", e))?;
    
    // Verify SHA-256
    let hash = calculate_sha256(&target_file)?;
    
    let name = if is_js { "Finance BI Dashboard" } else { "CRM Customer Panel" };
    let workspace = if is_js { "finance" } else { "crm" };
    
    let meta = ModuleMetadata {
        id: module_id,
        name: name.to_string(),
        version: "1.0.0".to_string(),
        file_path: target_file.to_string_lossy().to_string(),
        sha256: hash,
        workspace: workspace.to_string(),
    };
    
    Ok(meta)
}

#[tauri::command]
pub async fn get_installed_modules(app_handle: AppHandle) -> Result<Vec<ModuleMetadata>, String> {
    let target_dir = get_modules_target_dir(&app_handle);
    let mut installed = Vec::new();
    
    // Check for sales_bi
    let js_path = target_dir.join("sales_bi_module.js");
    if js_path.exists() {
        if let Ok(hash) = calculate_sha256(&js_path) {
            installed.push(ModuleMetadata {
                id: "sales_bi".to_string(),
                name: "Finance BI Dashboard".to_string(),
                version: "1.0.0".to_string(),
                file_path: js_path.to_string_lossy().to_string(),
                sha256: hash,
                workspace: "finance".to_string(),
            });
        }
    }
    
    // Check for crm
    let html_path = target_dir.join("crm_dashboard.html");
    if html_path.exists() {
        if let Ok(hash) = calculate_sha256(&html_path) {
            installed.push(ModuleMetadata {
                id: "crm".to_string(),
                name: "CRM Customer Panel".to_string(),
                version: "1.0.0".to_string(),
                file_path: html_path.to_string_lossy().to_string(),
                sha256: hash,
                workspace: "crm".to_string(),
            });
        }
    }
    
    Ok(installed)
}
