# Eddy Code App

`apps/eddy-code` 是 Eddy Code 的 CLI/TUI 应用入口，发布后的终端命令为 `eddy`。

常用命令：

```powershell
npx pnpm@10.33.0 --filter eddy-code run build
npx pnpm@10.33.0 --filter eddy-code run typecheck
npx pnpm@10.33.0 --filter eddy-code run smoke
```

启动源码构建产物：

```powershell
node apps\eddy-code\dist\main.mjs
```

模型配置入口：

```text
/config
/config diy
/model
```

`/config diy` 用于接入自定义模型服务，例如 DeepSeek、OpenAI-compatible API、私有模型网关或其他兼容供应商。
