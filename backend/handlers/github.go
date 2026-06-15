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

// SyncGitHub 从临时 JSON 文件读取库存数据，同步到 GitHub。
// 用法：sync --data-file <path>
// 环境变量：GH_TOKEN、GH_OWNER、GH_REPO（由 Tauri 在启动时通过 tauri.conf.json env 注入）
func SyncGitHub(args []string) error {
	token := os.Getenv("GH_TOKEN")
	owner := os.Getenv("GH_OWNER")
	repo  := os.Getenv("GH_REPO")
	if token == "" || owner == "" || repo == "" {
		return fmt.Errorf("缺少环境变量：GH_TOKEN / GH_OWNER / GH_REPO")
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

	msg := fmt.Sprintf("📦 更新库存数据 %s", time.Now().Format("2006-01-02"))
	client := &ghClient{token: token, owner: owner, repo: repo}

	type task struct {
		path string
		data json.RawMessage
	}
	tasks := []task{
		{"data/stock_in.json",    payload.StockIn},
		{"data/stock_out.json",   payload.StockOut},
		{"data/thresholds.json",  payload.Thresholds},
	}

	// 并发推送三个文件
	errs := make(chan error, len(tasks))
	for _, t := range tasks {
		go func(t task) {
			errs <- client.putFile(t.path, t.data, msg)
		}(t)
	}
	for range tasks {
		if err := <-errs; err != nil {
			return err
		}
	}
	return nil
}

// ---- GitHub API 客户端 ----

type ghClient struct {
	token, owner, repo string
}

func (c *ghClient) apiURL(path string) string {
	return fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", c.owner, c.repo, path)
}

func (c *ghClient) headers() map[string]string {
	return map[string]string{
		"Authorization":        "Bearer " + c.token,
		"Accept":               "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"Content-Type":         "application/json",
	}
}

// getFileSHA 获取文件当前的 SHA（文件不存在返回 ""）
func (c *ghClient) getFileSHA(path string) (string, error) {
	req, _ := http.NewRequest("GET", c.apiURL(path), nil)
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

// putFile 写入单个文件到 GitHub
func (c *ghClient) putFile(path string, data json.RawMessage, message string) error {
	sha, err := c.getFileSHA(path)
	if err != nil {
		return fmt.Errorf("获取 %s SHA 失败: %w", path, err)
	}

	// JSON 格式化后 base64 编码
	var pretty strings.Builder
	enc := json.NewEncoder(&pretty)
	enc.SetIndent("", "  ")
	var raw any
	json.Unmarshal(data, &raw)
	enc.Encode(raw)

	body := map[string]any{
		"message": message,
		"content": base64.StdEncoding.EncodeToString([]byte(pretty.String())),
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
