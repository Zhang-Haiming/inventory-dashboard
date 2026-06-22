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
	branch string // GH_DATA_BRANCH，默认为当前代码分支 "tauri"
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
		e.branch = "tauri" // 数据和代码同住一个分支
	}
	return e, nil
}

// dataPaths 返回指定公司的三个数据文件路径（data/{slug}/ 子目录）
func dataPaths(slug string) (stockIn, stockOut, thresholds string) {
	base := "data/" + slug
	return base + "/stock_in.json", base + "/stock_out.json", base + "/thresholds.json"
}

// parseArgs 从 args 里读取 --key value 形式的参数
func parseArgs(args []string) map[string]string {
	m := make(map[string]string)
	for i := 0; i < len(args)-1; i++ {
		if len(args[i]) > 2 && args[i][:2] == "--" {
			m[args[i][2:]] = args[i+1]
		}
	}
	return m
}

// SyncGitHub 从临时 JSON 文件读取库存数据，推送到 GH_DATA_BRANCH。
// 用法：sync --data-file <path> --company-slug <slug>
func SyncGitHub(args []string) error {
	env, err := loadGhEnv()
	if err != nil {
		return err
	}

	params := parseArgs(args)
	dataFile    := params["data-file"]
	slug        := params["company-slug"]
	companyName := params["company-name"]
	if dataFile == "" {
		return fmt.Errorf("缺少 --data-file 参数")
	}
	if slug == "" {
		slug = "default"
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

	pathIn, pathOut, pathThr := dataPaths(slug)
	msg := fmt.Sprintf("📦 更新库存数据 %s", time.Now().Format("2006-01-02"))

	// 顺序写入：三个文件依次提交，避免并发 commit 导致 GitHub 409
	type task struct {
		path string
		data json.RawMessage
	}
	tasks := []task{
		{pathIn,  payload.StockIn},
		{pathOut, payload.StockOut},
		{pathThr, payload.Thresholds},
	}
	for _, t := range tasks {
		if err := client.putFile(t.path, t.data, msg); err != nil {
			return err
		}
	}

	// 写入公司元数据（name/slug），供其他机器 pull 后统一公司名称
	if companyName != "" {
		metaJSON, _ := json.Marshal(map[string]string{"name": companyName, "slug": slug})
		companyPath := "data/" + slug + "/company.json"
		if err := client.putFile(companyPath, json.RawMessage(metaJSON), msg); err != nil {
			return err
		}

		// 更新全局公司注册表 data/companies.json
		if err := client.updateCompaniesRegistry(slug, companyName, msg); err != nil {
			return fmt.Errorf("更新公司注册表失败: %w", err)
		}
	}

	return nil
}

// SyncCompanyName 仅同步公司名称到远端，不动库存数据。
// 用法：sync-name --slug <slug> --name <name>
func SyncCompanyName(args []string) error {
	env, err := loadGhEnv()
	if err != nil {
		return err
	}
	params := parseArgs(args)
	slug := params["slug"]
	name := params["name"]
	if slug == "" {
		return fmt.Errorf("缺少 --slug 参数")
	}
	if name == "" {
		return fmt.Errorf("缺少 --name 参数")
	}

	client := &ghClient{ghEnv: env}
	if err := client.ensureBranchExists(); err != nil {
		return fmt.Errorf("确保 branch 存在失败: %w", err)
	}

	msg := fmt.Sprintf("🏢 更新公司名称 %s", time.Now().Format("2006-01-02"))

	// 更新 data/{slug}/company.json
	metaJSON, _ := json.Marshal(map[string]string{"name": name, "slug": slug})
	if err := client.putFile("data/"+slug+"/company.json", json.RawMessage(metaJSON), msg); err != nil {
		return fmt.Errorf("写入 company.json 失败: %w", err)
	}

	// 更新全局注册表
	return client.updateCompaniesRegistry(slug, name, msg)
}

// companyEntry 是 data/companies.json 中每条记录的格式
type companyEntry struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// companyData 是单家公司的完整拉取结果
type companyData struct {
	Slug       string          `json:"slug"`
	Name       string          `json:"name"`
	StockIn    json.RawMessage `json:"stock_in"`
	StockOut   json.RawMessage `json:"stock_out"`
	Thresholds json.RawMessage `json:"thresholds"`
}

// PullFromGitHub 从 GH_DATA_BRANCH 拉取全部公司数据，输出到 stdout。
// 优先读取 data/companies.json 获取公司列表；不存在则 fallback 到单公司模式。
// 用法：pull --company-slug <slug>（仅在 companies.json 不存在时有效）
func PullFromGitHub(args []string) error {
	env, err := loadGhEnv()
	if err != nil {
		return err
	}
	client := &ghClient{ghEnv: env}

	// 1. 读取全局公司注册表
	var companies []companyEntry
	registryContent, _ := client.getFileContent("data/companies.json")
	if registryContent != nil {
		_ = json.Unmarshal(registryContent, &companies)
	}

	// fallback：注册表不存在时，只拉当前公司（向后兼容旧仓库）
	if len(companies) == 0 {
		params := parseArgs(args)
		slug := params["company-slug"]
		if slug == "" {
			slug = "default"
		}
		companies = []companyEntry{{Slug: slug}}
	}

	// 2. 并行拉取每家公司的数据
	type fetchResult struct {
		idx  int
		data companyData
		err  error
	}
	ch := make(chan fetchResult, len(companies))

	for i, co := range companies {
		go func(idx int, co companyEntry) {
			data, err := client.pullOneCompany(co.Slug, co.Name)
			ch <- fetchResult{idx: idx, data: data, err: err}
		}(i, co)
	}

	results := make([]companyData, len(companies))
	for range companies {
		r := <-ch
		if r.err != nil {
			return r.err
		}
		results[r.idx] = r.data
	}

	// 3. 输出 {companies:[...]} 供 Rust 解析
	type pullOutput struct {
		Companies []companyData `json:"companies"`
	}
	return json.NewEncoder(os.Stdout).Encode(pullOutput{Companies: results})
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

// pullOneCompany 并行拉取单家公司的三个数据文件
func (c *ghClient) pullOneCompany(slug, name string) (companyData, error) {
	pathIn, pathOut, pathThr := dataPaths(slug)

	type fileResult struct {
		key     string
		content json.RawMessage
		err     error
	}
	fileCh := make(chan fileResult, 3)

	for _, kp := range []struct{ key, path string }{
		{"stock_in", pathIn}, {"stock_out", pathOut}, {"thresholds", pathThr},
	} {
		go func(key, path string) {
			content, ferr := c.getFileContent(path)
			fileCh <- fileResult{key: key, content: content, err: ferr}
		}(kp.key, kp.path)
	}

	files := make(map[string]json.RawMessage, 3)
	for i := 0; i < 3; i++ {
		r := <-fileCh
		if r.err != nil {
			return companyData{}, fmt.Errorf("拉取 %s/%s 失败: %w", slug, r.key, r.err)
		}
		if r.content == nil {
			switch r.key {
			case "thresholds":
				files[r.key] = json.RawMessage("{}")
			default:
				files[r.key] = json.RawMessage("[]")
			}
		} else {
			files[r.key] = r.content
		}
	}

	return companyData{
		Slug: slug, Name: name,
		StockIn: files["stock_in"], StockOut: files["stock_out"], Thresholds: files["thresholds"],
	}, nil
}

// updateCompaniesRegistry 读取并更新 data/companies.json（注册表）
func (c *ghClient) updateCompaniesRegistry(slug, name, commitMsg string) error {
	const registryPath = "data/companies.json"

	existing, _ := c.getFileContent(registryPath) // 文件不存在时为 nil，忽略错误

	var list []companyEntry
	if existing != nil {
		_ = json.Unmarshal(existing, &list)
	}

	found := false
	for i, co := range list {
		if co.Slug == slug {
			list[i].Name = name
			found = true
			break
		}
	}
	if !found {
		list = append(list, companyEntry{Slug: slug, Name: name})
	}

	listJSON, err := json.Marshal(list)
	if err != nil {
		return err
	}
	return c.putFile(registryPath, json.RawMessage(listJSON), commitMsg)
}
