import type { NextConfig } from "next";

// Electron 打包时使用静态导出（NEXT_PUBLIC_GH_TOKEN 有值说明是 Electron 构建）
const isElectronBuild = !!process.env.NEXT_PUBLIC_GH_TOKEN;

const nextConfig: NextConfig = {
  ...(isElectronBuild ? {
    output: "export",
    images: { unoptimized: true },
    // 关键：让所有资源使用相对路径，file:// 协议才能正确加载
    assetPrefix: "./",
    trailingSlash: true,
  } : {}),
};

export default nextConfig;
