package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
	"inventory-dashboard/backend/models"
)

// ParseExcel 解析 Excel 文件，支持 --base64 和 --path 两种输入方式
func ParseExcel(args []string) (*models.ParseResult, error) {
	var f *excelize.File
	var err error

	switch {
	case len(args) >= 2 && args[0] == "--base64":
		data, e := base64.StdEncoding.DecodeString(args[1])
		if e != nil {
			return nil, fmt.Errorf("base64 解码失败: %w", e)
		}
		f, err = excelize.OpenReader(strings.NewReader(string(data)))
		if err != nil {
			// excelize 要求 io.ReadSeeker，用临时文件
			tmp, e2 := os.CreateTemp("", "excel-*.xlsx")
			if e2 != nil {
				return nil, fmt.Errorf("无法创建临时文件: %w", e2)
			}
			defer os.Remove(tmp.Name())
			if _, e2 = tmp.Write(data); e2 != nil {
				return nil, e2
			}
			tmp.Close()
			f, err = excelize.OpenFile(tmp.Name())
		}

	case len(args) >= 2 && args[0] == "--path":
		f, err = excelize.OpenFile(args[1])

	default:
		return nil, fmt.Errorf("用法: parse-excel --base64 <b64> 或 --path <path>")
	}
	if err != nil {
		return nil, fmt.Errorf("打开 Excel 失败: %w", err)
	}
	defer f.Close()

	return parseWorkbook(f)
}

// ExportExcel 将库存数据写入 Excel 文件
func ExportExcel(args []string) error {
	var path, dataJSON string
	for i := 0; i < len(args)-1; i++ {
		switch args[i] {
		case "--path":
			path = args[i+1]
		case "--data":
			dataJSON = args[i+1]
		}
	}
	if path == "" || dataJSON == "" {
		return fmt.Errorf("用法: export-excel --path <p> --data <json>")
	}

	var data models.ExportData
	if err := json.Unmarshal([]byte(dataJSON), &data); err != nil {
		return fmt.Errorf("解析数据失败: %w", err)
	}

	f := excelize.NewFile()
	defer f.Close()

	// 入库表
	f.NewSheet("入库表")
	inHeaders := []string{"商品名称", "商品代码", "单价", "入库数量", "订单时间", "商品分类", "购买厂家"}
	for col, h := range inHeaders {
		cell, _ := excelize.CoordinatesToCellName(col+1, 1)
		f.SetCellValue("入库表", cell, h)
	}
	for rowIdx, r := range data.StockIn {
		row := rowIdx + 2
		values := []any{r.ProductName, r.ProductCode, r.UnitPrice, r.Quantity, r.OrderTime, strOrEmpty(r.Category), strOrEmpty(r.Supplier)}
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			f.SetCellValue("入库表", cell, v)
		}
	}

	// 出库表
	f.NewSheet("出库表")
	outHeaders := []string{"商品名称", "商品代码", "单价", "出库数量", "订单时间", "商品分类", "销售厂家"}
	for col, h := range outHeaders {
		cell, _ := excelize.CoordinatesToCellName(col+1, 1)
		f.SetCellValue("出库表", cell, h)
	}
	for rowIdx, r := range data.StockOut {
		row := rowIdx + 2
		values := []any{r.ProductName, r.ProductCode, r.UnitPrice, r.Quantity, r.OrderTime, strOrEmpty(r.Category), strOrEmpty(r.Customer)}
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			f.SetCellValue("出库表", cell, v)
		}
	}

	// 删除默认 Sheet1
	f.DeleteSheet("Sheet1")

	return f.SaveAs(path)
}

// ---- 内部解析逻辑 ----

var dateRe = regexp.MustCompile(`^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$`)

// 列名别名映射（与 TypeScript 版本保持一致）
var aliases = map[string][]string{
	"商品名称": {"商品名称", "品名", "名称", "商品"},
	"商品代码": {"商品代码", "代码", "编码", "货号", "SKU", "sku"},
	"单价":    {"单价", "价格", "含税单价"},
	"入库数量": {"入库数量", "数量", "入库量", "入库"},
	"出库数量": {"出库数量", "数量", "出库量", "出库"},
	"订单时间": {"订单时间", "时间", "日期", "入库日期", "出库日期"},
	"商品分类": {"商品分类", "分类", "类别", "品类"},
	"购买厂家": {"购买厂家", "厂家", "供应商", "采购厂家", "生产厂家"},
	"销售厂家": {"销售厂家", "销售方", "客户", "买家"},
}

var inSheetCandidates  = []string{"入库表", "入库", "入库记录", "StockIn"}
var outSheetCandidates = []string{"出库表", "出库", "出库记录", "StockOut"}

func parseWorkbook(f *excelize.File) (*models.ParseResult, error) {
	sheets := f.GetSheetList()
	var warnings []string

	inSheet  := findSheet(sheets, inSheetCandidates)
	outSheet := findSheet(sheets, outSheetCandidates)
	if inSheet == "" {
		warnings = append(warnings, fmt.Sprintf("未找到入库表，可用 Sheet：%s", strings.Join(sheets, "、")))
	}
	if outSheet == "" {
		warnings = append(warnings, fmt.Sprintf("未找到出库表，可用 Sheet：%s", strings.Join(sheets, "、")))
	}

	var stockIn  []models.StockInRow
	var stockOut []models.StockOutRow

	if inSheet != "" {
		rows, err := sheetToMaps(f, inSheet)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			norm := normalizeRow(r)
			name, _ := norm["商品名称"].(string)
			code, _ := norm["商品代码"].(string)
			if name == "" && code == "" {
				continue
			}
			row := models.StockInRow{
				ProductName: name,
				ProductCode: code,
				UnitPrice:   toFloat(norm["单价"]),
				Quantity:    toInt(norm["入库数量"]),
				OrderTime:   normalizeDate(norm["订单时间"]),
			}
			if v, ok := norm["商品分类"].(string); ok && v != "" {
				row.Category = &v
			}
			if v, ok := norm["购买厂家"].(string); ok && v != "" {
				row.Supplier = &v
			}
			stockIn = append(stockIn, row)
		}
	}

	if outSheet != "" {
		rows, err := sheetToMaps(f, outSheet)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			norm := normalizeRow(r)
			name, _ := norm["商品名称"].(string)
			code, _ := norm["商品代码"].(string)
			if name == "" && code == "" {
				continue
			}
			row := models.StockOutRow{
				ProductName: name,
				ProductCode: code,
				UnitPrice:   toFloat(norm["单价"]),
				Quantity:    toInt(norm["出库数量"]),
				OrderTime:   normalizeDate(norm["订单时间"]),
			}
			if v, ok := norm["商品分类"].(string); ok && v != "" {
				row.Category = &v
			}
			if v, ok := norm["销售厂家"].(string); ok && v != "" {
				row.Customer = &v
			}
			stockOut = append(stockOut, row)
		}
	}

	return &models.ParseResult{
		StockIn:  stockIn,
		StockOut: stockOut,
		Warnings: warnings,
	}, nil
}

func findSheet(sheets, candidates []string) string {
	for _, c := range candidates {
		for _, s := range sheets {
			if s == c {
				return s
			}
		}
	}
	// 模糊匹配
	for _, c := range candidates {
		for _, s := range sheets {
			if strings.Contains(s, c) || strings.Contains(c, s) {
				return s
			}
		}
	}
	return ""
}

func sheetToMaps(f *excelize.File, sheet string) ([]map[string]any, error) {
	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, err
	}
	if len(rows) < 2 {
		return nil, nil
	}
	headers := rows[0]
	var result []map[string]any
	for _, row := range rows[1:] {
		m := make(map[string]any, len(headers))
		for i, h := range headers {
			if i < len(row) {
				m[strings.TrimSpace(h)] = row[i]
			}
		}
		result = append(result, m)
	}
	return result, nil
}

// normalizeRow 将原始列名映射到标准列名
func normalizeRow(raw map[string]any) map[string]any {
	result := make(map[string]any, len(raw))
	matched := make(map[string]bool)
	for canon, aliasList := range aliases {
		for _, alias := range aliasList {
			if v, ok := raw[alias]; ok {
				result[canon] = v
				matched[alias] = true
				break
			}
		}
	}
	// 未识别的列原样保留
	for k, v := range raw {
		if !matched[k] {
			result[k] = v
		}
	}
	return result
}

func normalizeDate(v any) string {
	s := fmt.Sprintf("%v", v)
	s = strings.TrimSpace(s)
	if m := dateRe.FindStringSubmatch(s); m != nil {
		y, mo, d := m[1], m[2], m[3]
		if len(mo) == 1 {
			mo = "0" + mo
		}
		if len(d) == 1 {
			d = "0" + d
		}
		return y + "-" + mo + "-" + d
	}
	return s
}

func toFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return f
	}
	return 0
}

func toInt(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case float64:
		return int64(x)
	case string:
		i, _ := strconv.ParseInt(strings.TrimSpace(x), 10, 64)
		return i
	}
	return 0
}

func strOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
