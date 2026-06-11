import type { NextConfig } from "next";

// Electron 打包时使用静态导出（NEXT_PUBLIC_GH_TOKEN 有值说明是 Electron 构建）
const isElectronBuild = !!process.env.NEXT_PUBLIC_GH_TOKEN;

const nextConfig: NextConfig = {
  ...(isElectronBuild ? {
    // 静态导出：生成纯 HTML/JS/CSS，Electron 直接加载
    output: "export",
    images: { unoptimized: true },
  } : {}),
};

export default nextConfig;
