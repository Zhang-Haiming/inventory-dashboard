// 列名规范映射：允许 Excel 中的列名有轻微差异（空格、近义词）
export const COLUMN_ALIASES: Record<string, string[]> = {
  商品名称: ['商品名称', '品名', '名称', '商品'],
  商品代码: ['商品代码', '代码', '编码', '货号', 'SKU', 'sku'],
  单价: ['单价', '价格', '含税单价', '价格(元)'],
  入库数量: ['入库数量', '数量', '入库量', '入库'],
  出库数量: ['出库数量', '数量', '出库量', '出库'],
  订单时间: ['订单时间', '时间', '日期', '入库日期', '出库日期', '下单时间'],
  商品分类: ['商品分类', '分类', '类别', '品类'],
}

// 必须有的列（入库表）
export const REQUIRED_STOCK_IN_COLS = ['商品名称', '商品代码', '单价', '入库数量', '订单时间']
// 必须有的列（出库表）
export const REQUIRED_STOCK_OUT_COLS = ['商品名称', '商品代码', '单价', '出库数量', '订单时间']

// Sheet 名称映射（支持模糊匹配）
export const STOCK_IN_SHEET_NAMES = ['入库表', '入库', '入库记录', 'StockIn', 'stock_in']
export const STOCK_OUT_SHEET_NAMES = ['出库表', '出库', '出库记录', 'StockOut', 'stock_out']

// 默认阈值（未设置时为 0，0 表示不报警）
export const DEFAULT_THRESHOLD = 0

// GitHub 数据文件路径（在仓库中）
export const GITHUB_DATA_PATH = 'data/inventory.json'
