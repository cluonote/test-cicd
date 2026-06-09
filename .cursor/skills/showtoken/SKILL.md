---
name: showtoken
description: >-
  Shows last-turn token usage (best-effort), context/plan quota pointers, and
  account/session info when the user sends /showtoken or asks for token usage.
  Use immediately on those triggers.
---

# Show Token Usage

## Trigger

Run when the user message is exactly or contains:

- `/showtoken`
- `showtoken`
- 查看 token / 用量 / 余量（且意图为**执行汇报**，不是泛泛讨论）

## Workflow

### 1. Collect data

From repository root, run:

```bash
node .cursor/skills/showtoken/scripts/showtoken.mjs
```

Parse the JSON stdout. Do **not** read cookies, passwords, or SecretStorage.

### 2. Supplement (same turn, parallel if useful)

- Grep latest Cursor logs under `%APPDATA%/Cursor/logs` (or `~/Library/Application Support/Cursor/logs` on macOS) for `input_tokens`, `output_tokens`, `total_tokens` if the script returns `logTokenSamples`.
- Read account hint from `%APPDATA%/Cursor/sentry/scope_v3.json` → `scope.user.email` (already in script output).

### 3. Report in 中文

Use this structure:

```markdown
## Token 用量快照

### 上一轮对话（最近一轮 user → assistant）
| 项 | 值 |
|----|-----|
| 用户消息摘要 | … |
| 估算输入 token | … |
| 估算输出 token | … |
| 估算合计 | … |

> 若无 transcript：说明「暂无本地 transcript，无法估算上一轮」。

### 当前会话（本地 transcript 累计估算）
| 项 | 值 |
|----|-----|
| 消息条数 | … |
| 估算会话 token | … |
| transcript 路径 | … |

### 模型 / 套餐余量（重要）
| 项 | 说明 |
|----|------|
| **上下文窗口余量** | Cursor **不**在 agent-transcripts 里暴露；请看当前 Agent 对话**底部状态条**的 context 百分比，或 **Settings → Cursor Settings → Usage** |
| **Fast / Premium 请求余量** | 需 **Cursor Usage** 扩展（`yossisa.cursor-usage`）+ 浏览器 Cookie，或网页 [cursor.com/settings](https://cursor.com/settings) |
| **日志中的真实 token** | 若 `logTokenSamples` 非空，列出最近一条 `input_tokens` / `output_tokens` / `total_tokens`（来自 Cursor 内部日志，比估算更准） |

### 账户与其他
| 项 | 值 |
|----|-----|
| Cursor 账户邮箱 | …（来自 sentry，可能是 @cursor.com 转发邮箱） |
| 用户 ID | … |
| 工作区 | … |
| 数据时间 | ISO 时间 |

### 说明
- 估算算法：字符数 ÷ 4（参考 [ccusage](https://github.com/ryoppippi/ccusage) 的「本地解析」思路；ccusage 针对 Claude Code `~/.claude`，本 skill 针对 Cursor `agent-transcripts`）
- **估算 ≠ 账单**；以 Cursor 官方 Usage 为准
```

### 4. If data is missing

| 情况 | 动作 |
|------|------|
| 无 `agent-transcripts` | 提示先在本项目跑过至少一轮 Agent 对话 |
| 无 log token 样本 | 说明 Cursor 未在日志落盘，只能估算或看 UI |
| 用户要精确账单 | 指引 **Settings → Usage** 或安装 Cursor Usage 扩展 |

## Safety

- NEVER extract or display `WorkosCursorSessionToken`, passwords, or API keys
- NEVER call cursor.com API unless user explicitly configured a tool with their own credentials
- Label all non-log numbers as **估算**

## Optional args

`/showtoken session` — emphasize full-session totals from transcript.
