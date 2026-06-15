mod commands;
mod db;

use commands::DbState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 开发时加载 .env.local（GitHub 配置）
    // 依次尝试：当前目录 → 上级目录（src-tauri/ 下运行时）→ 可执行文件旁边
    // 生产打包后此文件不存在，env vars 需通过其他方式注入（todo：设置界面）
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
            // 数据库文件放在系统 app data 目录（macOS: ~/Library/Application Support/inventory-dashboard/）
            let data_dir = app.path().app_data_dir()
                .expect("无法获取 app data 目录");
            std::fs::create_dir_all(&data_dir)
                .expect("无法创建 app data 目录");
            let db_path = data_dir.join("inventory.db");

            let conn = db::init(&db_path)
                .expect("数据库初始化失败");
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
