# XianRen Auto Agent

自动接受 AI Agent 的文件编辑、终端命令和重试提示。支持 Antigravity 和 Cursor IDE。

## 功能

- ✅ **自动接受** — 文件编辑、终端命令、重试提示自动确认
- ✅ **后台模式** — 多标签同时运行，无需手动切换
- ✅ **危险命令拦截** — 阻止 `rm -rf /` 等破坏性命令
- ✅ **实时状态覆盖层** — 紫色=进行中，绿色=已完成

## 快速开始

1. 安装扩展
2. 按提示启用 CDP（复制平台脚本到终端运行）
3. 完全重启 IDE
4. 状态栏显示 `Auto Accept: ON` 即可

## 前置要求

- Antigravity 或 Cursor IDE
- 开启 remote debugging port（一次性设置）

## 构建

```bash
cd extension
npm install
npm run compile
npm run package
```

## License

MIT
