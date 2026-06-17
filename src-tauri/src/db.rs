use rusqlite::{Connection, Result, params, OptionalExtension};
use std::path::Path;

/// 初始化数据库，建表 + 迁移（支持多公司）
pub fn init(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;

    // ---- 基础表 ----
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS companies (
            id   TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS stock_in (
            id           TEXT NOT NULL,
            company_id   TEXT NOT NULL DEFAULT 'default',
            product_name TEXT NOT NULL,
            product_code TEXT NOT NULL,
            unit_price   REAL NOT NULL DEFAULT 0,
            quantity     INTEGER NOT NULL DEFAULT 0,
            order_time   TEXT NOT NULL DEFAULT '',
            category     TEXT,
            supplier     TEXT,
            extra        TEXT,
            PRIMARY KEY (company_id, id)
        );
        CREATE TABLE IF NOT EXISTS stock_out (
            id           TEXT NOT NULL,
            company_id   TEXT NOT NULL DEFAULT 'default',
            product_name TEXT NOT NULL,
            product_code TEXT NOT NULL,
            unit_price   REAL NOT NULL DEFAULT 0,
            quantity     INTEGER NOT NULL DEFAULT 0,
            order_time   TEXT NOT NULL DEFAULT '',
            category     TEXT,
            customer     TEXT,
            extra        TEXT,
            PRIMARY KEY (company_id, id)
        );
        CREATE TABLE IF NOT EXISTS thresholds_v2 (
            company_id   TEXT NOT NULL DEFAULT 'default',
            product_code TEXT NOT NULL,
            min_quantity INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (company_id, product_code)
        );
        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    ")?;

    // ---- 旧 schema 迁移（stock_in/stock_out 原 PK 是单列 id）----
    // 若旧表已存在，加 company_id 列（忽略"列已存在"错误）
    let _ = conn.execute("ALTER TABLE stock_in ADD COLUMN company_id TEXT NOT NULL DEFAULT 'default'", []);
    let _ = conn.execute("ALTER TABLE stock_out ADD COLUMN company_id TEXT NOT NULL DEFAULT 'default'", []);

    // 迁移旧 thresholds → thresholds_v2
    let _ = conn.execute_batch("
        CREATE TABLE IF NOT EXISTS thresholds (
            product_code TEXT PRIMARY KEY,
            min_quantity INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO thresholds_v2 (company_id, product_code, min_quantity)
            SELECT 'default', product_code, min_quantity FROM thresholds;
    ");

    // ---- 确保默认公司存在 ----
    let company_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM companies", [], |r| r.get(0)
    ).unwrap_or(0);
    if company_count == 0 {
        conn.execute(
            "INSERT OR IGNORE INTO companies (id, name, slug) VALUES (?1, ?2, ?3)",
            params!["default", "默认公司", "default"],
        )?;
        set_meta(&conn, "current_company_id", "default")?;
    }

    Ok(conn)
}

// ---- 公司 CRUD ----

pub fn list_companies(conn: &Connection) -> Result<Vec<crate::commands::Company>> {
    let mut stmt = conn.prepare("SELECT id, name, slug FROM companies ORDER BY rowid")?;
    let rows = stmt.query_map([], |r| Ok(crate::commands::Company {
        id:   r.get(0)?,
        name: r.get(1)?,
        slug: r.get(2)?,
    }))?;
    rows.collect()
}

pub fn insert_company(conn: &Connection, company: &crate::commands::Company) -> Result<()> {
    conn.execute(
        "INSERT INTO companies (id, name, slug) VALUES (?1, ?2, ?3)",
        params![company.id, company.name, company.slug],
    )?;
    Ok(())
}

pub fn rename_company(conn: &Connection, id: &str, name: &str) -> Result<()> {
    conn.execute("UPDATE companies SET name = ?1 WHERE id = ?2", params![name, id])?;
    Ok(())
}

pub fn delete_company(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM stock_in    WHERE company_id = ?1", params![id])?;
    conn.execute("DELETE FROM stock_out   WHERE company_id = ?1", params![id])?;
    conn.execute("DELETE FROM thresholds_v2 WHERE company_id = ?1", params![id])?;
    conn.execute("DELETE FROM companies   WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_company_slug(conn: &Connection, id: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT slug FROM companies WHERE id = ?1",
        params![id], |r| r.get(0),
    ).optional()
}

pub fn get_current_company_id(conn: &Connection) -> Result<String> {
    Ok(get_meta(conn, "current_company_id")?.unwrap_or_else(|| "default".to_string()))
}

pub fn set_current_company_id(conn: &Connection, id: &str) -> Result<()> {
    set_meta(conn, "current_company_id", id)
}

// ---- 数据 CRUD（按 company_id 分区）----

/// 清空指定公司数据（Excel 导入时调用，不影响其他公司）
pub fn clear_company(conn: &Connection, company_id: &str) -> Result<()> {
    conn.execute("DELETE FROM stock_in      WHERE company_id = ?1", params![company_id])?;
    conn.execute("DELETE FROM stock_out     WHERE company_id = ?1", params![company_id])?;
    conn.execute("DELETE FROM thresholds_v2 WHERE company_id = ?1", params![company_id])?;
    Ok(())
}

pub fn upsert_stock_in(conn: &Connection, company_id: &str, rows: &[crate::commands::StockInRow]) -> Result<()> {
    let mut stmt = conn.prepare("
        INSERT OR REPLACE INTO stock_in
            (id, company_id, product_name, product_code, unit_price, quantity, order_time, category, supplier, extra)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    ")?;
    for r in rows {
        let extra = r.extra.as_ref().map(|e| serde_json::to_string(e).unwrap_or_default());
        stmt.execute(params![
            r.id, company_id, r.商品名称, r.商品代码, r.单价, r.入库数量,
            r.订单时间, r.商品分类, r.购买厂家, extra
        ])?;
    }
    Ok(())
}

pub fn upsert_stock_out(conn: &Connection, company_id: &str, rows: &[crate::commands::StockOutRow]) -> Result<()> {
    let mut stmt = conn.prepare("
        INSERT OR REPLACE INTO stock_out
            (id, company_id, product_name, product_code, unit_price, quantity, order_time, category, customer, extra)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    ")?;
    for r in rows {
        let extra = r.extra.as_ref().map(|e| serde_json::to_string(e).unwrap_or_default());
        stmt.execute(params![
            r.id, company_id, r.商品名称, r.商品代码, r.单价, r.出库数量,
            r.订单时间, r.商品分类, r.销售厂家, extra
        ])?;
    }
    Ok(())
}

pub fn upsert_thresholds(conn: &Connection, company_id: &str, thresholds: &std::collections::HashMap<String, i64>) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT OR REPLACE INTO thresholds_v2 (company_id, product_code, min_quantity) VALUES (?1, ?2, ?3)"
    )?;
    for (code, qty) in thresholds {
        stmt.execute(params![company_id, code, qty])?;
    }
    Ok(())
}

pub fn read_stock_in(conn: &Connection, company_id: &str) -> Result<Vec<crate::commands::StockInRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, product_name, product_code, unit_price, quantity, order_time, category, supplier, extra
         FROM stock_in WHERE company_id = ?1"
    )?;
    let rows = stmt.query_map(params![company_id], |r| {
        let extra_str: Option<String> = r.get(8)?;
        let extra = extra_str.as_deref().and_then(|s| serde_json::from_str(s).ok());
        Ok(crate::commands::StockInRow {
            id: r.get(0)?, 商品名称: r.get(1)?, 商品代码: r.get(2)?,
            单价: r.get(3)?, 入库数量: r.get(4)?, 订单时间: r.get(5)?,
            商品分类: r.get(6)?, 购买厂家: r.get(7)?, extra,
        })
    })?;
    rows.collect()
}

pub fn read_stock_out(conn: &Connection, company_id: &str) -> Result<Vec<crate::commands::StockOutRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, product_name, product_code, unit_price, quantity, order_time, category, customer, extra
         FROM stock_out WHERE company_id = ?1"
    )?;
    let rows = stmt.query_map(params![company_id], |r| {
        let extra_str: Option<String> = r.get(8)?;
        let extra = extra_str.as_deref().and_then(|s| serde_json::from_str(s).ok());
        Ok(crate::commands::StockOutRow {
            id: r.get(0)?, 商品名称: r.get(1)?, 商品代码: r.get(2)?,
            单价: r.get(3)?, 出库数量: r.get(4)?, 订单时间: r.get(5)?,
            商品分类: r.get(6)?, 销售厂家: r.get(7)?, extra,
        })
    })?;
    rows.collect()
}

pub fn read_thresholds(conn: &Connection, company_id: &str) -> Result<std::collections::HashMap<String, i64>> {
    let mut stmt = conn.prepare(
        "SELECT product_code, min_quantity FROM thresholds_v2 WHERE company_id = ?1"
    )?;
    let rows = stmt.query_map(params![company_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
    rows.collect::<Result<std::collections::HashMap<_, _>>>()
}

// ---- meta ----

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)", params![key, value])?;
    Ok(())
}

pub fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM meta WHERE key = ?1",
        params![key], |r| r.get(0),
    ).optional()
}

// ---- GitHub 配置 ----

pub fn save_github_config(conn: &Connection, config: &crate::commands::GitHubConfig) -> Result<()> {
    set_meta(conn, "gh_token",  &config.token)?;
    set_meta(conn, "gh_owner",  &config.owner)?;
    set_meta(conn, "gh_repo",   &config.repo)?;
    set_meta(conn, "gh_branch", &config.data_branch)?;
    Ok(())
}

pub fn load_github_config(conn: &Connection) -> Result<crate::commands::GitHubConfig> {
    Ok(crate::commands::GitHubConfig {
        token:       get_meta(conn, "gh_token")? .unwrap_or_default(),
        owner:       get_meta(conn, "gh_owner")? .unwrap_or_default(),
        repo:        get_meta(conn, "gh_repo")?  .unwrap_or_default(),
        data_branch: get_meta(conn, "gh_branch")?.unwrap_or_default(),
    })
}
