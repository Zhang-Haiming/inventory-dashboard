use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

use crate::db;

// ---- 共享数据库连接 ----

pub struct DbState(pub Mutex<rusqlite::Connection>);

// ---- 数据结构（与 TypeScript 类型一一对应）----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockInRow {
    pub id: String,
    #[serde(rename = "商品名称")]
    pub 商品名称: String,
    #[serde(rename = "商品代码")]
    pub 商品代码: String,
    #[serde(rename = "单价")]
    pub 单价: f64,
    #[serde(rename = "入库数量")]
    pub 入库数量: i64,
    #[serde(rename = "订单时间")]
    pub 订单时间: String,
    #[serde(rename = "商品分类")]
    pub 商品分类: Option<String>,
    #[serde(rename = "购买厂家")]
    pub 购买厂家: Option<String>,
    /// 自定义列，序列化为 JSON object 存 SQLite
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockOutRow {
    pub id: String,
    #[serde(rename = "商品名称")]
    pub 商品名称: String,
    #[serde(rename = "商品代码")]
    pub 商品代码: String,
    #[serde(rename = "单价")]
    pub 单价: f64,
    #[serde(rename = "出库数量")]
    pub 出库数量: i64,
    #[serde(rename = "订单时间")]
    pub 订单时间: String,
    #[serde(rename = "商品分类")]
    pub 商品分类: Option<String>,
    #[serde(rename = "销售厂家")]
    pub 销售厂家: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InventoryPayload {
    pub stock_in: Vec<StockInRow>,
    pub stock_out: Vec<StockOutRow>,
    pub thresholds: HashMap<String, i64>,
    pub last_updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GitHubConfig {
    pub token:       String,
    pub owner:       String,
    pub repo:        String,
    pub data_branch: String,
}

// ---- Tauri Commands ----

/// 加载所有库存数据（前端启动时调用）
#[tauri::command]
pub fn load_data(db: State<DbState>) -> Result<Option<InventoryPayload>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let stock_in  = db::read_stock_in(&conn).map_err(|e| e.to_string())?;
    let stock_out = db::read_stock_out(&conn).map_err(|e| e.to_string())?;
    let thresholds = db::read_thresholds(&conn).map_err(|e| e.to_string())?;

    if stock_in.is_empty() && stock_out.is_empty() {
        return Ok(None);
    }

    let last_updated = db::get_meta(&conn, "last_updated")
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    Ok(Some(InventoryPayload { stock_in, stock_out, thresholds, last_updated }))
}

/// 保存所有库存数据到 SQLite
#[tauri::command]
pub fn save_data(payload: InventoryPayload, db: State<DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    db::clear_all(&conn).map_err(|e| e.to_string())?;
    db::upsert_stock_in(&conn, &payload.stock_in).map_err(|e| e.to_string())?;
    db::upsert_stock_out(&conn, &payload.stock_out).map_err(|e| e.to_string())?;
    db::upsert_thresholds(&conn, &payload.thresholds).map_err(|e| e.to_string())?;
    db::set_meta(&conn, "last_updated", &payload.last_updated).map_err(|e| e.to_string())?;

    Ok(())
}

/// 触发 Go binary 执行 GitHub 同步
/// Rust 从 SQLite 读数据，序列化为 JSON 经 stdin 传给 Go，Go 推送到 GitHub
#[tauri::command]
pub async fn sync_github(app: tauri::AppHandle, db: State<'_, DbState>) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    // 读取当前数据
    let payload = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let stock_in   = db::read_stock_in(&conn).map_err(|e| e.to_string())?;
        let stock_out  = db::read_stock_out(&conn).map_err(|e| e.to_string())?;
        let thresholds = db::read_thresholds(&conn).map_err(|e| e.to_string())?;
        serde_json::json!({
            "stock_in": stock_in,
            "stock_out": stock_out,
            "thresholds": thresholds,
        })
    };
    let json_bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;

    // 写入临时文件，Go 从文件读取（避免 stdin 管道复杂性）
    let tmp_path = std::env::temp_dir().join("inventory_sync_data.json");
    std::fs::write(&tmp_path, &json_bytes).map_err(|e| e.to_string())?;
    let tmp_str = tmp_path.to_string_lossy().to_string();

    let output = app
        .shell()
        .sidecar("backend")
        .map_err(|e| e.to_string())?
        .args(["sync", "--data-file", &tmp_str])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&tmp_path); // 清理临时文件

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("GitHub 同步失败: {}", stderr));
    }
    Ok(())
}

/// 接收前端传来的 Excel base64，交给 Go binary 解析
#[tauri::command]
pub async fn parse_excel(base64: String, app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_shell::ShellExt;

    let output = app
        .shell()
        .sidecar("backend")
        .map_err(|e| e.to_string())?
        .args(["parse-excel", "--base64", &base64])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Excel 解析失败: {}", stderr));
    }
    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    serde_json::from_str(&stdout).map_err(|e| e.to_string())
}

/// 接收文件路径，交给 Go binary 解析 Excel
#[tauri::command]
pub async fn parse_excel_path(path: String, app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_shell::ShellExt;

    let output = app
        .shell()
        .sidecar("backend")
        .map_err(|e| e.to_string())?
        .args(["parse-excel", "--path", &path])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Excel 解析失败: {}", stderr));
    }
    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    serde_json::from_str(&stdout).map_err(|e| e.to_string())
}

/// 导出 Excel 到指定路径（Go binary 生成文件）
#[tauri::command]
pub async fn export_excel(
    path: String,
    stock_in: Vec<StockInRow>,
    stock_out: Vec<StockOutRow>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let data = serde_json::json!({ "stock_in": stock_in, "stock_out": stock_out });
    let json_str = serde_json::to_string(&data).map_err(|e| e.to_string())?;

    let output = app
        .shell()
        .sidecar("backend")
        .map_err(|e| e.to_string())?
        .args(["export-excel", "--path", &path, "--data", &json_str])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Excel 导出失败: {}", stderr));
    }
    Ok(())
}

/// 从 GH_DATA_BRANCH 拉取数据，写入本地 SQLite
/// 前端调用场景：点击「刷新」按钮，或首次启动时 SQLite 为空
#[tauri::command]
pub async fn pull_from_github(app: tauri::AppHandle, db: State<'_, DbState>) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let output = app
        .shell()
        .sidecar("backend")
        .map_err(|e| e.to_string())?
        .args(["pull"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("拉取失败: {}", stderr));
    }

    // Go 输出的 JSON：{ "stock_in": [...], "stock_out": [...], "thresholds": {...} }
    #[derive(serde::Deserialize)]
    struct PullPayload {
        stock_in:   Vec<StockInRow>,
        stock_out:  Vec<StockOutRow>,
        thresholds: std::collections::HashMap<String, i64>,
    }

    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let pulled: PullPayload = serde_json::from_str(&stdout).map_err(|e| e.to_string())?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::clear_all(&conn).map_err(|e| e.to_string())?;
    db::upsert_stock_in(&conn, &pulled.stock_in).map_err(|e| e.to_string())?;
    db::upsert_stock_out(&conn, &pulled.stock_out).map_err(|e| e.to_string())?;
    db::upsert_thresholds(&conn, &pulled.thresholds).map_err(|e| e.to_string())?;
    db::set_meta(&conn, "last_updated", &chrono_now()).map_err(|e| e.to_string())?;

    Ok(())
}

/// 读取已保存的 GitHub 配置（优先返回 DB 值；若 env var 已设置则合并覆盖）
#[tauri::command]
pub fn get_github_config(db: State<'_, DbState>) -> Result<GitHubConfig, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut cfg = db::load_github_config(&conn).map_err(|e| e.to_string())?;

    // 若 .env.local 或系统环境变量有更高优先级的值，展示给用户看
    if let Ok(v) = std::env::var("GITHUB_TOKEN") { if !v.is_empty() { cfg.token       = v; } }
    if let Ok(v) = std::env::var("GITHUB_OWNER") { if !v.is_empty() { cfg.owner       = v; } }
    if let Ok(v) = std::env::var("GITHUB_REPO")  { if !v.is_empty() { cfg.repo        = v; } }
    if let Ok(v) = std::env::var("GH_DATA_BRANCH") { if !v.is_empty() { cfg.data_branch = v; } }

    Ok(cfg)
}

/// 保存 GitHub 配置到 SQLite，并立即更新进程环境变量（Go sidecar 同步生效）
#[tauri::command]
pub fn save_github_config(config: GitHubConfig, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::save_github_config(&conn, &config).map_err(|e| e.to_string())?;

    // 立即更新进程 env，后续 Go sidecar 调用无需重启即可生效
    std::env::set_var("GITHUB_TOKEN",   &config.token);
    std::env::set_var("GITHUB_OWNER",   &config.owner);
    std::env::set_var("GITHUB_REPO",    &config.repo);
    std::env::set_var("GH_DATA_BRANCH", &config.data_branch);

    Ok(())
}

fn chrono_now() -> String {
    // 使用系统时间格式化 ISO 8601（不引入 chrono 依赖）
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // 简单格式化：只需要记录时间戳字符串
    format!("{}", secs)
}
