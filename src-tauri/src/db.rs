use rusqlite::{Connection, Result, params, OptionalExtension};
use std::path::Path;

/// 初始化数据库，建表（若不存在）
pub fn init(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS stock_in (
            id           TEXT PRIMARY KEY,
            product_name TEXT NOT NULL,
            product_code TEXT NOT NULL,
            unit_price   REAL NOT NULL DEFAULT 0,
            quantity     INTEGER NOT NULL DEFAULT 0,
            order_time   TEXT NOT NULL DEFAULT '',
            category     TEXT,
            supplier     TEXT,
            extra        TEXT  -- JSON，存放自定义列
        );
        CREATE TABLE IF NOT EXISTS stock_out (
            id           TEXT PRIMARY KEY,
            product_name TEXT NOT NULL,
            product_code TEXT NOT NULL,
            unit_price   REAL NOT NULL DEFAULT 0,
            quantity     INTEGER NOT NULL DEFAULT 0,
            order_time   TEXT NOT NULL DEFAULT '',
            category     TEXT,
            customer     TEXT,
            extra        TEXT  -- JSON，存放自定义列
        );
        CREATE TABLE IF NOT EXISTS thresholds (
            product_code TEXT PRIMARY KEY,
            min_quantity INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    ")?;
    Ok(conn)
}

/// 清空所有表（导入 Excel 时使用）
pub fn clear_all(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        DELETE FROM stock_in;
        DELETE FROM stock_out;
        DELETE FROM thresholds;
    ")
}

/// 批量插入或替换（UPSERT）
pub fn upsert_stock_in(conn: &Connection, rows: &[crate::commands::StockInRow]) -> Result<()> {
    let mut stmt = conn.prepare("
        INSERT OR REPLACE INTO stock_in
            (id, product_name, product_code, unit_price, quantity, order_time, category, supplier, extra)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ")?;
    for r in rows {
        let extra = r.extra.as_ref().map(|e| serde_json::to_string(e).unwrap_or_default());
        stmt.execute(params![
            r.id, r.商品名称, r.商品代码, r.单价, r.入库数量,
            r.订单时间, r.商品分类, r.购买厂家, extra
        ])?;
    }
    Ok(())
}

pub fn upsert_stock_out(conn: &Connection, rows: &[crate::commands::StockOutRow]) -> Result<()> {
    let mut stmt = conn.prepare("
        INSERT OR REPLACE INTO stock_out
            (id, product_name, product_code, unit_price, quantity, order_time, category, customer, extra)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ")?;
    for r in rows {
        let extra = r.extra.as_ref().map(|e| serde_json::to_string(e).unwrap_or_default());
        stmt.execute(params![
            r.id, r.商品名称, r.商品代码, r.单价, r.出库数量,
            r.订单时间, r.商品分类, r.销售厂家, extra
        ])?;
    }
    Ok(())
}

pub fn upsert_thresholds(conn: &Connection, thresholds: &std::collections::HashMap<String, i64>) -> Result<()> {
    let mut stmt = conn.prepare("INSERT OR REPLACE INTO thresholds (product_code, min_quantity) VALUES (?1, ?2)")?;
    for (code, qty) in thresholds {
        stmt.execute(params![code, qty])?;
    }
    Ok(())
}

pub fn read_stock_in(conn: &Connection) -> Result<Vec<crate::commands::StockInRow>> {
    let mut stmt = conn.prepare("SELECT id, product_name, product_code, unit_price, quantity, order_time, category, supplier, extra FROM stock_in")?;
    let rows = stmt.query_map([], |r| {
        let extra_str: Option<String> = r.get(8)?;
        let extra = extra_str
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok());
        Ok(crate::commands::StockInRow {
            id: r.get(0)?,
            商品名称: r.get(1)?,
            商品代码: r.get(2)?,
            单价: r.get(3)?,
            入库数量: r.get(4)?,
            订单时间: r.get(5)?,
            商品分类: r.get(6)?,
            购买厂家: r.get(7)?,
            extra,
        })
    })?;
    rows.collect()
}

pub fn read_stock_out(conn: &Connection) -> Result<Vec<crate::commands::StockOutRow>> {
    let mut stmt = conn.prepare("SELECT id, product_name, product_code, unit_price, quantity, order_time, category, customer, extra FROM stock_out")?;
    let rows = stmt.query_map([], |r| {
        let extra_str: Option<String> = r.get(8)?;
        let extra = extra_str
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok());
        Ok(crate::commands::StockOutRow {
            id: r.get(0)?,
            商品名称: r.get(1)?,
            商品代码: r.get(2)?,
            单价: r.get(3)?,
            出库数量: r.get(4)?,
            订单时间: r.get(5)?,
            商品分类: r.get(6)?,
            销售厂家: r.get(7)?,
            extra,
        })
    })?;
    rows.collect()
}

pub fn read_thresholds(conn: &Connection) -> Result<std::collections::HashMap<String, i64>> {
    let mut stmt = conn.prepare("SELECT product_code, min_quantity FROM thresholds")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
    rows.collect::<Result<std::collections::HashMap<_, _>>>()
}

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)", params![key, value])?;
    Ok(())
}

pub fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM meta WHERE key = ?1",
        params![key],
        |r| r.get(0),
    ).optional()
}
