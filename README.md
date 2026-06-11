# 库存看板

个体经营内部库存管理看板，支持 Excel 上传、在线编辑、低库存预警，部署在 Vercel + GitHub，通过链接访问，无需任何本地环境。

---

## 功能

- 📊 **月度统计**：按月查看入库/出库金额和数量，含近12个月趋势图
- 📦 **商品库存**：按分类查看当前库存，支持筛选
- ⚠️ **库存预警**：低于阈值的商品醒目红色标记，显示缺口数量
- 📝 **在线编辑**：点击单元格直接编辑，新增/删除记录
- 📤 **上传 Excel**：拖拽上传 .xlsx 文件，自动解析入库表/出库表
- 📥 **下载 Excel**：将当前数据导出为 .xlsx 文件保存到本地

## Excel 格式要求

Excel 文件需包含两个 Sheet：

### 入库表（Sheet 名称：入库表、入库、入库记录）

| 商品名称 | 商品代码 | 商品分类 | 单价 | 入库数量 | 订单时间 |
|---------|---------|---------|-----|---------|---------|
| 笔记本 | NB001 | 文具 | 25.5 | 100 | 2026-05-01 |

### 出库表（Sheet 名称：出库表、出库、出库记录）

| 商品名称 | 商品代码 | 商品分类 | 单价 | 出库数量 | 订单时间 |
|---------|---------|---------|-----|---------|---------|
| 笔记本 | NB001 | 文具 | 25.5 | 30 | 2026-05-15 |

**列名支持轻微变化**（如"品名"→"商品名称"，"编码"→"商品代码"）。

## 部署步骤

### 1. 将代码推送到你的 GitHub

### 2. 创建 GitHub 个人访问令牌（PAT）

1. 打开 GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens
2. 设置权限：选择 `inventory-dashboard` 仓库，**Contents → Read and write**
3. 复制生成的 Token

### 3. 部署到 Vercel

1. 打开 vercel.com，导入 `inventory-dashboard` 仓库
2. 添加环境变量：
   - `GITHUB_TOKEN` = 上面的 Token
   - `GITHUB_OWNER` = 你的 GitHub 用户名
   - `GITHUB_REPO` = `inventory-dashboard`
3. 部署完成后把链接分享给团队

## 本地开发

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
