package models

// StockInRow 对应前端 TypeScript 的 StockInRow
// JSON tag 使用中文保持与前端/Rust 数据结构一致
type StockInRow struct {
	ID          string   `json:"id"`
	ProductName string   `json:"商品名称"`
	ProductCode string   `json:"商品代码"`
	UnitPrice   float64  `json:"单价"`
	Quantity    int64    `json:"入库数量"`
	OrderTime   string   `json:"订单时间"`
	Category    *string  `json:"商品分类,omitempty"`
	Supplier    *string  `json:"购买厂家,omitempty"`
}

// StockOutRow 对应前端 TypeScript 的 StockOutRow
type StockOutRow struct {
	ID          string   `json:"id"`
	ProductName string   `json:"商品名称"`
	ProductCode string   `json:"商品代码"`
	UnitPrice   float64  `json:"单价"`
	Quantity    int64    `json:"出库数量"`
	OrderTime   string   `json:"订单时间"`
	Category    *string  `json:"商品分类,omitempty"`
	Customer    *string  `json:"销售厂家,omitempty"`
}

// ParseResult 是 parse-excel 子命令的输出
type ParseResult struct {
	StockIn  []StockInRow  `json:"stock_in"`
	StockOut []StockOutRow `json:"stock_out"`
	Warnings []string      `json:"warnings"`
}

// ExportData 是 export-excel 子命令接收的数据
type ExportData struct {
	StockIn  []StockInRow  `json:"stock_in"`
	StockOut []StockOutRow `json:"stock_out"`
}
