// backend/main.go
//
// Go sidecar，被 Tauri(Rust) 通过 shell sidecar 调用。
// 不是常驻进程——每次调用执行一个子命令后退出。
//
// 子命令：
//   parse-excel --base64 <base64>   解析 base64 编码的 Excel 文件
//   parse-excel --path <path>       解析磁盘上的 Excel 文件
//   export-excel --path <p> --data <json>  生成 Excel 文件到指定路径
//   sync                            同步数据到 GitHub
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"inventory-dashboard/backend/handlers"
)

func main() {
	log.SetOutput(os.Stderr) // 日志走 stderr，stdout 保留给 JSON 输出

	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: backend <subcommand> [options]")
		os.Exit(1)
	}

	switch os.Args[1] {
	case "parse-excel":
		result, err := handlers.ParseExcel(os.Args[2:])
		exitOnErr(err, "parse-excel")
		writeJSON(result)

	case "export-excel":
		err := handlers.ExportExcel(os.Args[2:])
		exitOnErr(err, "export-excel")

	case "sync":
		err := handlers.SyncGitHub(os.Args[2:])
		exitOnErr(err, "sync")

	default:
		fmt.Fprintf(os.Stderr, "未知子命令: %s\n", os.Args[1])
		os.Exit(1)
	}
}

func writeJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "")
	if err := enc.Encode(v); err != nil {
		log.Fatalf("JSON 序列化失败: %v", err)
	}
}

func exitOnErr(err error, cmd string) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "[%s] 错误: %v\n", cmd, err)
		os.Exit(1)
	}
}
