mod commands;
mod db;

use commands::DbState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. 开发时加载 .env.local（优先级最高，不会被 DB 值覆盖）
    let cwd = std::env::current_dir().unwrap_or_default();
    let _ = dotenvy::from_path(cwd.join(".env.local"))
        .or_else(|_| dotenvy::from_path(cwd.join("..").join(".env.local")))
        .or_else(|_| {
            let exe = std::env::current_exe().unwrap_or_default();
            dotenvy::from_path(exe.parent().unwrap_or(std::path::Path::new(".")).join(".env.local"))
        });

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()
                .expect("无法获取 app data 目录");
            std::fs::create_dir_all(&data_dir)
                .expect("无法创建 app data 目录");
            let db_path = data_dir.join("inventory.db");

            let conn = db::init(&db_path)
                .expect("数据库初始化失败");

            // 2. 从 DB 加载 GitHub 配置，对尚未被 .env.local 设置的变量补充注入
            if let Ok(cfg) = db::load_github_config(&conn) {
                if std::env::var("GITHUB_TOKEN").unwrap_or_default().is_empty() && !cfg.token.is_empty() {
                    std::env::set_var("GITHUB_TOKEN", &cfg.token);
                }
                if std::env::var("GITHUB_OWNER").unwrap_or_default().is_empty() && !cfg.owner.is_empty() {
                    std::env::set_var("GITHUB_OWNER", &cfg.owner);
                }
                if std::env::var("GITHUB_REPO").unwrap_or_default().is_empty() && !cfg.repo.is_empty() {
                    std::env::set_var("GITHUB_REPO", &cfg.repo);
                }
                if std::env::var("GH_DATA_BRANCH").unwrap_or_default().is_empty() && !cfg.data_branch.is_empty() {
                    std::env::set_var("GH_DATA_BRANCH", &cfg.data_branch);
                }
            }

            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_data,
            commands::save_data,
            commands::sync_github,
            commands::pull_from_github,
            commands::parse_excel,
            commands::parse_excel_path,
            commands::export_excel,
            commands::get_github_config,
            commands::save_github_config,
            commands::list_companies,
            commands::get_current_company,
            commands::add_company,
            commands::rename_company,
            commands::delete_company,
            commands::switch_company,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
