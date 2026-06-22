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
    #[serde(rename = "商品名称")]  pub 商品名称: String,
    #[serde(rename = "商品代码")]  pub 商品代码: String,
    #[serde(rename = "单价")]      pub 单价: f64,
    #[serde(rename = "入库数量")]  pub 入库数量: i64,
    #[serde(rename = "订单时间")]  pub 订单时间: String,
    #[serde(rename = "商品分类")]  pub 商品分类: Option<String>,
    #[serde(rename = "购买厂家")]  pub 购买厂家: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockOutRow {
    pub id: String,
    #[serde(rename = "商品名称")]  pub 商品名称: String,
    #[serde(rename = "商品代码")]  pub 商品代码: String,
    #[serde(rename = "单价")]      pub 单价: f64,
    #[serde(rename = "出库数量")]  pub 出库数量: i64,
    #[serde(rename = "订单时间")]  pub 订单时间: String,
    #[serde(rename = "商品分类")]  pub 商品分类: Option<String>,
    #[serde(rename = "销售厂家")]  pub 销售厂家: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InventoryPayload {
    pub stock_in:    Vec<StockInRow>,
    pub stock_out:   Vec<StockOutRow>,
    pub thresholds:  HashMap<String, i64>,
    pub last_updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GitHubConfig {
    pub token:       String,
    pub owner:       String,
    pub repo:        String,
    pub data_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Company {
    pub id:   String,
    pub name: String,
    pub slug: String,
}

// ---- 公司管理命令 ----

#[tauri::command]
pub fn list_companies(db: State<'_, DbState>) -> Result<Vec<Company>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::list_companies(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_current_company(db: State<'_, DbState>) -> Result<Company, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = db::get_current_company_id(&conn).map_err(|e| e.to_string())?;
    let companies = db::list_companies(&conn).map_err(|e| e.to_string())?;
    companies.into_iter().find(|c| c.id == id)
        .ok_or_else(|| "找不到当前公司".to_string())
}

/// 新增公司，自动生成 slug（uuid 前 8 位）
#[tauri::command]
pub fn add_company(name: String, db: State<'_, DbState>) -> Result<Company, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    // 生成唯一 id 和 slug（用时间戳 + name hash 保证唯一）
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH).unwrap_or_default()
        .subsec_nanos();
    let id   = format!("co_{:08x}", ts);
    // slug: 保留 ASCII 字母数字，转小写，超过 16 字符截断，加 id 后缀
    let base: String = name.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .take(12)
        .collect();
    let slug = if base.is_empty() {
        id.clone()
    } else {
        format!("{}-{}", base, &id[3..7])
    };
    let company = Company { id, name, slug };
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert_company(&conn, &company).map_err(|e| e.to_string())?;
    Ok(company)
}

#[tauri::command]
pub fn rename_company(id: String, name: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::rename_company(&conn, &id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_company(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // 删除时若是当前公司，切换到默认公司
    let current = db::get_current_company_id(&conn).map_err(|e| e.to_string())?;
    if current == id {
        db::set_current_company_id(&conn, "default").map_err(|e| e.to_string())?;
    }
    db::delete_company(&conn, &id).map_err(|e| e.to_string())
}

/// 切换当前公司，返回该公司的库存数据
#[tauri::command]
pub fn switch_company(id: String, db: State<'_, DbState>) -> Result<Option<InventoryPayload>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::set_current_company_id(&conn, &id).map_err(|e| e.to_string())?;
    load_payload(&conn, &id)
}

// ---- 库存数据命令 ----

/// 加载当前公司的库存数据
#[tauri::command]
pub fn load_data(db: State<'_, DbState>) -> Result<Option<InventoryPayload>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let company_id = db::get_current_company_id(&conn).map_err(|e| e.to_string())?;
    load_payload(&conn, &company_id)
}

fn load_payload(conn: &rusqlite::Connection, company_id: &str) -> Result<Option<InventoryPayload>, String> {
    let stock_in   = db::read_stock_in(conn, company_id).map_err(|e| e.to_string())?;
    let stock_out  = db::read_stock_out(conn, company_id).map_err(|e| e.to_string())?;
    let thresholds = db::read_thresholds(conn, company_id).map_err(|e| e.to_string())?;

    if stock_in.is_empty() && stock_out.is_empty() {
        return Ok(None);
    }
    let last_updated = db::get_meta(conn, "last_updated")
        .map_err(|e| e.to_string())?.unwrap_or_default();

    Ok(Some(InventoryPayload { stock_in, stock_out, thresholds, last_updated }))
}

/// 保存当前公司的库存数据到 SQLite
#[tauri::command]
pub fn save_data(payload: InventoryPayload, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let company_id = db::get_current_company_id(&conn).map_err(|e| e.to_string())?;

    db::clear_company(&conn, &company_id).map_err(|e| e.to_string())?;
    db::upsert_stock_in(&conn, &company_id, &payload.stock_in).map_err(|e| e.to_string())?;
    db::upsert_stock_out(&conn, &company_id, &payload.stock_out).map_err(|e| e.to_string())?;
    db::upsert_thresholds(&conn, &company_id, &payload.thresholds).map_err(|e| e.to_string())?;
    db::set_meta(&conn, "last_updated", &payload.last_updated).map_err(|e| e.to_string())?;
    Ok(())
}

/// 同步当前公司数据到 GitHub（写入 data/{slug}/ 子目录）
#[tauri::command]
pub async fn sync_github(app: tauri::AppHandle, db: State<'_, DbState>) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let (payload_json, slug, company_name) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let company_id = db::get_current_company_id(&conn).map_err(|e| e.to_string())?;
        let slug = db::get_company_slug(&conn, &company_id)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "default".to_string());
        let name = db::get_company_name(&conn, &company_id)
            .map_err(|e| e.to_string())?
            .unwrap_or_default();
        let stock_in   = db::read_stock_in(&conn, &company_id).map_err(|e| e.to_string())?;
        let stock_out  = db::read_stock_out(&conn, &company_id).map_err(|e| e.to_string())?;
        let thresholds = db::read_thresholds(&conn, &company_id).map_err(|e| e.to_string())?;
        let json = serde_json::json!({ "stock_in": stock_in, "stock_out": stock_out, "thresholds": thresholds });
        (serde_json::to_vec(&json).map_err(|e| e.to_string())?, slug, name)
    };

    let tmp_path = std::env::temp_dir().join("inventory_sync_data.json");
    std::fs::write(&tmp_path, &payload_json).map_err(|e| e.to_string())?;
    let tmp_str = tmp_path.to_string_lossy().to_string();

    let output = app
        .shell().sidecar("backend").map_err(|e| e.to_string())?
        .args(["sync", "--data-file", &tmp_str, "--company-slug", &slug,
               "--company-name", &company_name])
        .output().await.map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&tmp_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("GitHub 同步失败: {}", stderr));
    }
    Ok(())
}

/// 仅将公司名称同步到 GitHub（不动库存数据）
#[tauri::command]
pub async fn sync_company_name(id: String, app: tauri::AppHandle, db: State<'_, DbState>) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let (slug, name) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let slug = db::get_company_slug(&conn, &id)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| id.clone());
        let name = db::get_company_name(&conn, &id)
            .map_err(|e| e.to_string())?
            .unwrap_or_default();
        (slug, name)
    };

    let output = app
        .shell().sidecar("backend").map_err(|e| e.to_string())?
        .args(["sync-name", "--slug", &slug, "--name", &name])
        .output().await.map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("同步公司名称失败: {}", stderr));
    }
    Ok(())
}

/// 从 GitHub 拉取当前公司数据（data/{slug}/ 子目录）
#[tauri::command]
pub async fn pull_from_github(app: tauri::AppHandle, db: State<'_, DbState>) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    // slug 仅用于 fallback：当远端没有 companies.json 时，Go 会只拉这一家
    let slug = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let id = db::get_current_company_id(&conn).map_err(|e| e.to_string())?;
        db::get_company_slug(&conn, &id)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "default".to_string())
    };

    let output = app
        .shell().sidecar("backend").map_err(|e| e.to_string())?
        .args(["pull", "--company-slug", &slug])
        .output().await.map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("拉取失败: {}", stderr));
    }

    // ---- 解析 Go sidecar 输出（多公司格式）----
    #[derive(Deserialize)]
    struct RemoteCompany {
        slug:       String,
        name:       String,
        stock_in:   Vec<StockInRow>,
        stock_out:  Vec<StockOutRow>,
        thresholds: HashMap<String, i64>,
    }
    #[derive(Deserialize)]
    struct PullAllPayload {
        companies: Vec<RemoteCompany>,
    }

    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let pulled: PullAllPayload = serde_json::from_str(&stdout).map_err(|e| e.to_string())?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    for remote in pulled.companies {
        // 按 slug 查找本地公司
        let local = db::get_company_by_slug(&conn, &remote.slug)
            .map_err(|e| e.to_string())?;

        let local_id = match local {
            Some(ref c) => {
                // 名称不同时更新（远端为准）
                if !remote.name.is_empty() && c.name != remote.name {
                    let _ = db::rename_company(&conn, &c.id, &remote.name);
                }
                c.id.clone()
            }
            None => {
                // 本地没有此公司：以 slug 为 id 创建（保证两端 slug 一致）
                let new_company = Company {
                    id:   remote.slug.clone(),
                    name: remote.name.clone(),
                    slug: remote.slug.clone(),
                };
                db::insert_company(&conn, &new_company).map_err(|e| e.to_string())?;
                remote.slug.clone()
            }
        };

        // 全量覆盖写入（pull = 远端数据替换本地）
        db::clear_company(&conn, &local_id).map_err(|e| e.to_string())?;
        db::upsert_stock_in(&conn, &local_id, &remote.stock_in).map_err(|e| e.to_string())?;
        db::upsert_stock_out(&conn, &local_id, &remote.stock_out).map_err(|e| e.to_string())?;
        db::upsert_thresholds(&conn, &local_id, &remote.thresholds).map_err(|e| e.to_string())?;
    }

    db::set_meta(&conn, "last_updated", &chrono_now()).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Excel ----

#[tauri::command]
pub async fn parse_excel(base64: String, app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_shell::ShellExt;
    let output = app.shell().sidecar("backend").map_err(|e| e.to_string())?
        .args(["parse-excel", "--base64", &base64])
        .output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("Excel 解析失败: {}", String::from_utf8_lossy(&output.stderr)));
    }
    serde_json::from_str(&String::from_utf8(output.stdout).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn parse_excel_path(path: String, app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_shell::ShellExt;
    let output = app.shell().sidecar("backend").map_err(|e| e.to_string())?
        .args(["parse-excel", "--path", &path])
        .output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("Excel 解析失败: {}", String::from_utf8_lossy(&output.stderr)));
    }
    serde_json::from_str(&String::from_utf8(output.stdout).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_excel(path: String, stock_in: Vec<StockInRow>, stock_out: Vec<StockOutRow>, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    let json_str = serde_json::to_string(&serde_json::json!({ "stock_in": stock_in, "stock_out": stock_out }))
        .map_err(|e| e.to_string())?;
    let output = app.shell().sidecar("backend").map_err(|e| e.to_string())?
        .args(["export-excel", "--path", &path, "--data", &json_str])
        .output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("Excel 导出失败: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

// ---- GitHub 配置 ----

#[tauri::command]
pub fn get_github_config(db: State<'_, DbState>) -> Result<GitHubConfig, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut cfg = db::load_github_config(&conn).map_err(|e| e.to_string())?;
    if let Ok(v) = std::env::var("GITHUB_TOKEN")   { if !v.is_empty() { cfg.token       = v; } }
    if let Ok(v) = std::env::var("GITHUB_OWNER")   { if !v.is_empty() { cfg.owner       = v; } }
    if let Ok(v) = std::env::var("GITHUB_REPO")    { if !v.is_empty() { cfg.repo        = v; } }
    if let Ok(v) = std::env::var("GH_DATA_BRANCH") { if !v.is_empty() { cfg.data_branch = v; } }
    Ok(cfg)
}

#[tauri::command]
pub fn save_github_config(config: GitHubConfig, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::save_github_config(&conn, &config).map_err(|e| e.to_string())?;
    std::env::set_var("GITHUB_TOKEN",   &config.token);
    std::env::set_var("GITHUB_OWNER",   &config.owner);
    std::env::set_var("GITHUB_REPO",    &config.repo);
    std::env::set_var("GH_DATA_BRANCH", &config.data_branch);
    Ok(())
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("{}", secs)
}
