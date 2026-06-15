package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// ghEnv 从环境变量读取 GitHub 配置
// 环境变量由 Tauri 在启动时通过 tauri.conf.json 的 env 字段注入
type ghEnv struct {
	token  string
	owner  string
	repo   string
	branch string // GH_DATA_BRANCH，如 "data-tauri"，默认 "main"
}

// getenv 优先读新变量名，回退到旧变量名（兼容旧 .env.local）
func getenv(newKey, oldKey string) string {
	if v := os.Getenv(newKey); v != "" {
		return v
	}
	return os.Getenv(oldKey)
}

func loadGhEnv() (ghEnv, error) {
	e := ghEnv{
		token:  getenv("GITHUB_TOKEN", "GH_TOKEN"),
		owner:  getenv("GITHUB_OWNER", "GH_OWNER"),
		repo:   getenv("GITHUB_REPO", "GH_REPO"),
		branch: getenv("GH_DATA_BRANCH", ""),
	}
	if e.token == "" || e.owner == "" || e.repo == "" {
		return e, fmt.Errorf("缺少环境变量：GH_TOKEN / GH_OWNER / GH_REPO")
	}
	if e.branch == "" {
		e.branch = "main" // 默认写 main branch（兼容旧版本）
	}
	return e, nil
}

// 三个数据文件的固定路径（branch 不同，路径相同）
var dataPaths = struct{ stockIn, stockOut, thresholds string }{
	stockIn:    "data/stock_in.json",
	stockOut:   "data/stock_out.json",
	thresholds: "data/thresholds.json",
}

// SyncGitHub 从临时 JSON 文件读取库存数据，推送到 GH_DATA_BRANCH。
// 用法：sync --data-file <path>
func SyncGitHub(args []string) error {
	env, err := loadGhEnv()
	if err != nil {
		return err
	}

	var dataFile string
	for i := 0; i < len(args)-1; i++ {
		if args[i] == "--data-file" {
			dataFile = args[i+1]
		}
	}
	if dataFile == "" {
		return fmt.Errorf("缺少 --data-file 参数")
	}

	f, err := os.Open(dataFile)
	if err != nil {
		return fmt.Errorf("打开数据文件失败: %w", err)
	}
	defer f.Close()

	var payload struct {
		StockIn    json.RawMessage `json:"stock_in"`
		StockOut   json.RawMessage `json:"stock_out"`
		Thresholds json.RawMessage `json:"thresholds"`
	}
	if err := json.NewDecoder(f).Decode(&payload); err != nil {
		return fmt.Errorf("解析数据文件失败: %w", err)
	}

	client := &ghClient{ghEnv: env}

	// 确保目标 branch 存在（首次同步时自动创建）
	if err := client.ensureBranchExists(); err != nil {
		return fmt.Errorf("确保 branch 存在失败: %w", err)
	}

	msg := fmt.Sprintf("📦 更新库存数据 %s", time.Now().Format("2006-01-02"))

	// 顺序写入：三个文件依次提交，避免并发 commit 导致 GitHub 409
	type task struct {
		path string
		data json.RawMessage
	}
	tasks := []task{
		{dataPaths.stockIn,    payload.StockIn},
		{dataPaths.stockOut,   payload.StockOut},
		{dataPaths.thresholds, payload.Thresholds},
	}
	for _, t := range tasks {
		if err := client.putFile(t.path, t.data, msg); err != nil {
			return err
		}
	}
	return nil
}

// PullFromGitHub 从 GH_DATA_BRANCH 拉取三个 JSON 文件，合并后输出到 stdout。
// Rust 收到 stdout 后写入 SQLite。
// 用法：pull
func PullFromGitHub(_ []string) error {
	env, err := loadGhEnv()
	if err != nil {
		return err
	}
	client := &ghClient{ghEnv: env}

	type fileResult struct {
		key     string
		content json.RawMessage
		err     error
	}

	paths := map[string]string{
		"stock_in":    dataPaths.stockIn,
		"stock_out":   dataPaths.stockOut,
		"thresholds":  dataPaths.thresholds,
	}

	results := make(chan fileResult, len(paths))
	for key, path := range paths {
		go func(key, path string) {
			content, err := client.getFileContent(path)
			results <- fileResult{key: key, content: content, err: err}
		}(key, path)
	}

	payload := make(map[string]json.RawMessage, 3)
	for range paths {
		r := <-results
		if r.err != nil {
			return fmt.Errorf("拉取 %s 失败: %w", r.key, r.err)
		}
		if r.content == nil {
			// 文件不存在，用空数组/对象兜底
			switch r.key {
			case "thresholds":
				payload[r.key] = json.RawMessage("{}")
			default:
				payload[r.key] = json.RawMessage("[]")
			}
		} else {
			payload[r.key] = r.content
		}
	}

	return json.NewEncoder(os.Stdout).Encode(payload)
}

// ---- GitHub API 客户端 ----

type ghClient struct {
	ghEnv
}

func (c *ghClient) apiURL(path string) string {
	return fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s",
		c.owner, c.repo, path)
}

func (c *ghClient) headers() map[string]string {
	return map[string]string{
		"Authorization":        "Bearer " + c.token,
		"Accept":               "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"Content-Type":         "application/json",
	}
}

// getFileSHA 获取指定 branch 上文件的 SHA（不存在返回 ""）
func (c *ghClient) getFileSHA(path string) (string, error) {
	url := c.apiURL(path) + "?ref=" + c.branch
	req, _ := http.NewRequest("GET", url, nil)
	for k, v := range c.headers() {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return "", nil
	}
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("GitHub API %d: %s", resp.StatusCode, body)
	}
	var result struct {
		SHA string `json:"sha"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	return result.SHA, nil
}

// getFileContent 获取指定 branch 上文件的内容（不存在返回 nil）
func (c *ghClient) getFileContent(path string) (json.RawMessage, error) {
	url := c.apiURL(path) + "?ref=" + c.branch
	req, _ := http.NewRequest("GET", url, nil)
	for k, v := range c.headers() {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return nil, nil
	}
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API %d: %s", resp.StatusCode, body)
	}
	var result struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	decoded, err := base64.StdEncoding.DecodeString(
		strings.ReplaceAll(result.Content, "\n", ""),
	)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(decoded), nil
}

// putFile 写入单个文件到指定 branch
func (c *ghClient) putFile(path string, data json.RawMessage, message string) error {
	sha, err := c.getFileSHA(path)
	if err != nil {
		return fmt.Errorf("获取 %s SHA 失败: %w", path, err)
	}

	var pretty strings.Builder
	enc := json.NewEncoder(&pretty)
	enc.SetIndent("", "  ")
	var raw any
	json.Unmarshal(data, &raw)
	enc.Encode(raw)

	body := map[string]any{
		"message": message,
		"content": base64.StdEncoding.EncodeToString([]byte(pretty.String())),
		"branch":  c.branch, // ← 指定目标 branch
	}
	if sha != "" {
		body["sha"] = sha
	}
	bodyJSON, _ := json.Marshal(body)

	req, _ := http.NewRequest("PUT", c.apiURL(path), strings.NewReader(string(bodyJSON)))
	for k, v := range c.headers() {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 409 {
		return fmt.Errorf("冲突：%s 已被其他人更新，请刷新后重试", path)
	}
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GitHub API %d: %s", resp.StatusCode, b)
	}
	return nil
}

// ensureBranchExists 检查 branch 是否存在，不存在则从默认 branch 创建
func (c *ghClient) ensureBranchExists() error {
	if c.branch == "main" || c.branch == "master" {
		return nil // 主 branch 必然存在
	}

	// 检查 branch 是否存在
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/branches/%s",
		c.owner, c.repo, c.branch)
	req, _ := http.NewRequest("GET", url, nil)
	for k, v := range c.headers() {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()

	if resp.StatusCode == 200 {
		return nil // 已存在
	}

	// 获取默认 branch 的最新 commit SHA
	refURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/git/refs/heads/main",
		c.owner, c.repo)
	req, _ = http.NewRequest("GET", refURL, nil)
	for k, v := range c.headers() {
		req.Header.Set(k, v)
	}
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var ref struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&ref); err != nil {
		return err
	}

	// 创建新 branch
	createURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/git/refs",
		c.owner, c.repo)
	body, _ := json.Marshal(map[string]string{
		"ref": "refs/heads/" + c.branch,
		"sha": ref.Object.SHA,
	})
	req, _ = http.NewRequest("POST", createURL, strings.NewReader(string(body)))
	for k, v := range c.headers() {
		req.Header.Set(k, v)
	}
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp2.Body.Close()
	if resp2.StatusCode >= 400 {
		b, _ := io.ReadAll(resp2.Body)
		return fmt.Errorf("创建 branch 失败 %d: %s", resp2.StatusCode, b)
	}
	return nil
}
