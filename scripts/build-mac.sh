#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(uname -s)" != "Darwin" ]; then
  echo "错误：macOS 安装包必须在 Mac 上构建（electron-builder 不支持从 Windows 交叉构建 dmg）。"
  exit 1
fi

echo "==> 安装依赖"
npm ci --no-audit --no-fund

echo "==> 构建应用"
npm run build

echo "==> 打包 dmg / zip（当前机器架构）"
npx electron-builder --mac dmg zip --publish never

echo ""
echo "完成。产物位于 release/："
ls -lh release/*.dmg release/*.zip 2>/dev/null || true
echo ""
echo "未签名版本首次打开：右键 App -> 打开，或在终端执行"
echo "  xattr -dr com.apple.quarantine \"/Applications/AI短剧工坊.app\""
