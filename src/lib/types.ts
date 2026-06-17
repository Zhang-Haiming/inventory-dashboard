// ---- 数据模型 ----

// 额外字段类型（用户在 Excel 中自定义的列）
export type ExtraFields = Record<string, unknown>

export type StockInRow = {
  id: string
  商品名称: string
  商品代码: string
  单价: number
  入库数量: number
  订单时间: string  // ISO 日期字符串 YYYY-MM-DD
  商品分类?: string
  购买厂家?: string
} & ExtraFields

export type StockOutRow = {
  id: string
  商品名称: string
  商品代码: string
  单价: number
  出库数量: number
  订单时间: string
  商品分类?: string
  销售厂家?: string
} & ExtraFields

// thresholds: 商品代码 -> 最低库存警戒线（0 表示不报警）
export type Thresholds = Record<string, number>

export interface InventoryData {
  lastUpdated: string
  stockIn: StockInRow[]
  stockOut: StockOutRow[]
  thresholds: Thresholds
}

// ---- 派生视图类型 ----

export interface MonthlySummary {
  month: string        // 'YYYY-MM'
  stockInAmount: number
  stockOutAmount: number
  stockInQty: number
  stockOutQty: number
}

export interface ProductInventory {
  商品代码: string
  商品名称: string
  商品分类: string
  totalIn: number
  totalOut: number
  currentStock: number
  threshold: number
  isLow: boolean       // currentStock <= threshold && threshold > 0
}

// ---- API 响应类型 ----

export interface DataApiResponse {
  data: InventoryData
  sha: string
}

export interface UploadApiResponse {
  stockIn: Omit<StockInRow, 'id'>[]
  stockOut: Omit<StockOutRow, 'id'>[]
  warnings: string[]
}

// ---- 公司 ----

export interface Company {
  id:   string
  name: string
  slug: string
}

// ---- GitHub 配置 ----

export interface GitHubConfig {
  token:       string   // GITHUB_TOKEN
  owner:       string   // GITHUB_OWNER
  repo:        string   // GITHUB_REPO
  data_branch: string   // GH_DATA_BRANCH（Rust snake_case，与 Serde 序列化保持一致）
}
