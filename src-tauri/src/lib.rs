mod commands;
mod db;

use commands::DbState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            commands::parse_excel,
            commands::parse_excel_path,
            commands::export_excel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
