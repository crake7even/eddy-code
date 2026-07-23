<p align="center">
  <img width="128" height="128" alt="Eddy Code" src="apps/eddy-code/icon.ico" />
</p>

<h1 align="center">Eddy Code</h1>

<p align="center">
  <strong>属于你的本地 AI 智能助手</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/eddy-code"><img src="https://img.shields.io/npm/v/eddy-code?style=flat-square&logo=npm&logoColor=white" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/eddy-code"><img src="https://img.shields.io/npm/dm/eddy-code?style=flat-square&logo=npm&logoColor=white" alt="npm downloads"></a>
  <a href="https://github.com/crake7even/eddy-code/stargazers"><img src="https://img.shields.io/github/stars/crake7even/eddy-code?style=flat-square&logo=github" alt="stars"></a>
  <a href="https://github.com/crake7even/eddy-code/issues"><img src="https://img.shields.io/github/issues/crake7even/eddy-code?style=flat-square&logo=github" alt="issues"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22.0.0-green?style=flat-square&logo=node.js&logoColor=white" alt="node version"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="platform">
</p>

---

Eddy Code 是一个终端原生的本地 AI Agent CLI/TUI。你可以用中文或英文直接描述任务，让它协助写代码、改文件、执行命令、整理上下文、恢复会话、维护长期记忆，并通过多 Agent 协作处理更复杂的工程任务。

主命令是 `eddy`，npm package 是 `eddy-code`。

---

## ✨ 核心特性

<table>
  <tr>
    <td>
      <h3>🎯 Goal loop 循环</h3>
      <p><strong>非无效 loop，目标自主驱动。</strong> 设定目标后自动多轮迭代执行，支持预算控制、完成状态追踪和跨轮上下文延续。</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>🧠 永久记忆备忘录</h3>
      <p><strong>把项目偏好、痛点记忆和可复用经验沉淀下来。</strong> 支持跨会话共享，让长期项目越用越懂你。</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>🛡️ 效率级轻量底层</h3>
      <p><strong>本地优先，安全可控。</strong> 文件修改、命令执行和敏感配置都围绕本地环境工作，适合日常开发、学习和工程维护。</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>⚡ 多代理编排引擎</h3>
      <p><strong>支持为子 Agent 开启多代理编排模式。</strong> 可自定义配置子 Agent 模型，让不同模型去做自己最擅长的工作。</p>
    </td>
  </tr>
</table>

---

## 📖 核心功能

| 功能 | 说明 |
| --- | --- |
| 💬 对话式交互 | 用自然语言描述需求，它自动写代码、改文件、跑命令 |
| 🔒 安全第一 | 修改文件前必须征得同意，`.env` 等敏感文件默认禁止操作 |
| 🛡️ 权限引擎 | 精细控制它能做什么，包括读取、写入、执行，防止误操作 |
| ⚙️ 状态机机制 | 防漂移，强化任务颗粒度，不出错，任务完成度高，降低 Token 消耗 |
| 🧠 fusionplan | 复杂需求规划时给出多个角度的方案，并融合为真实可行的方案 |
| 🧠 记忆备忘录 | `/memory` 打开交互式记忆备忘录，跨会话共享，知识库 tag 分级 |
| 📚 SAG 知识库 | `/knowledge` 打开交互式知识库，配置导入向量，可视化知识图谱 |
| 💤 dream 整理 | `/dream` 定期整理重复和过时记录，auto 模式下不可用，避免误删 |
| 🎯 目标系统 | `/goal` 开启自主目标循环，支持轮次、Token、时间等预算控制 |
| 💾 会话恢复 | 随时中断，随时继续，对话历史自动保存 |
| 🔄 多模式 | 交互模式、静默模式、计划模式、后台任务模式 |
| 🔌 MCP 扩展 | 连接外部工具，例如数据库、浏览器、API 等 |
| 🤖 多 Agent 并行 | 复杂任务自动拆解为多个子 Agent 同时执行 |
| 🎨 技能中心 | 搜罗多款技能可下载，用户也可以自行安装 skill 技能 |
| 🐺 wolfpack | 群狼模式，适合多文件多任务同时处理，拥有自动审批权限，子 Agent 并发无上限 |
| 🌳 多代理编排 | `/config diy` 自定义给子 Agent/代理配置不同的模型，让最合适的模型做最合适的工作 |

---

## 🏙️ cc-connect 通过聊天远程控制

支持微信、飞书、Slack、钉钉、QQ、Telegram 等。你可以在安装 `eddy-code` 后一键安装 `cc-connect`，用聊天平台远程控制你的 Eddy Code。

```bash
npm install -g cc-connect
```

在 Eddy Code 中输入：

```text
/cc-connect
```

按照界面提示选择平台并完成配置。配置完成后，可以按提示启动后台服务，让聊天平台和本地 Eddy Code 建立连接。

---

## 🚀 三分钟上手

### 方式一：npm 安装

前置条件：

- Node.js `>=22.0.0`
- Git

安装：

```bash
npm install -g eddy-code
```

启动：

```bash
eddy
```

查看版本和帮助：

```bash
eddy --version
eddy --help
```

### 方式二：从源码运行

```powershell
npx pnpm@10.33.0 install
npx pnpm@10.33.0 --filter eddy-code run build
npx pnpm@10.33.0 run link:eddy
```

重新打开终端后运行：

```powershell
eddy
```

---

## ⚙️ 模型配置

首次启动时，如果还没有配置模型，Eddy Code 会引导进入 `/config` 配置流程。你也可以在交互界面中手动输入：

```text
/config
```

常用入口：

| 命令 | 作用 |
| --- | --- |
| `/config` | 打开模型配置入口，查看或配置当前模型服务 |
| `/config diy` | 自定义模型供应商，适合接入 DeepSeek、OpenAI-compatible API、私有网关或其他兼容服务 |
| `/model` | 查看、切换或管理已经配置好的模型 |

`/config diy` 会引导你填写 API Base URL、API Key、模型名等信息。它也可以用于给子 Agent/代理分别指定不同模型：例如让轻量模型处理检索、整理、归纳，让更强模型负责复杂规划、代码生成或审查。

涉及 API Key、Token 或私钥时，请使用本地安全配置或 `.env`，不要提交到仓库，也不要打印到日志。

---

## 🧪 开发命令

```powershell
npx pnpm@10.33.0 install
npx pnpm@10.33.0 run typecheck
npx pnpm@10.33.0 --filter eddy-code run build
npx pnpm@10.33.0 --filter eddy-code run smoke
```
