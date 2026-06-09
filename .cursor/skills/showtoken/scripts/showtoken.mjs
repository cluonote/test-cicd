#!/usr/bin/env node
/**
 * Best-effort token / usage report for Cursor Agent sessions.
 * Inspired by ccusage (local transcript parsing); Cursor IDE does not always
 * persist exact per-turn token counts in agent-transcripts.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'

const cwd = process.cwd()

function projectSlugFromPath(dir) {
  const norm = dir.replace(/\\/g, '/').replace(/:/g, '')
  return createHash('md5').update(norm).digest('hex').slice(0, 32)
}

function findProjectDir() {
  const slug = projectSlugFromPath(cwd)
  const candidates = [
    join(homedir(), '.cursor', 'projects', slug),
    join(homedir(), '.cursor', 'projects', `c-${basename(cwd)}`),
  ]
  for (const name of readdirSync(join(homedir(), '.cursor', 'projects'), {
    withFileTypes: true,
  })) {
    if (!name.isDirectory()) continue
    const full = join(homedir(), '.cursor', 'projects', name.name)
    if (full.includes('test-cicd') || name.name.includes('test-cicd')) {
      candidates.unshift(full)
    }
  }
  for (const p of [...new Set(candidates)]) {
    if (existsSync(p)) return p
  }
  return null
}

function newestTranscript(projectDir) {
  const base = join(projectDir, 'agent-transcripts')
  if (!existsSync(base)) return null
  let best = null
  let bestMtime = 0
  for (const dir of readdirSync(base, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const jsonl = join(base, dir.name, `${dir.name}.jsonl`)
    if (!existsSync(jsonl)) continue
    const m = statSync(jsonl).mtimeMs
    if (m > bestMtime) {
      bestMtime = m
      best = jsonl
    }
  }
  return best
}

function parseJsonl(path) {
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
  return lines.map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return null
    }
  }).filter(Boolean)
}

function extractText(entry) {
  const parts = entry?.message?.content
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
}

function estimateTokens(text) {
  if (!text) return 0
  // Rough heuristic: ~4 chars/token for mixed EN/ZH (not billing-grade)
  return Math.ceil(text.length / 4)
}

function lastCompletedRound(entries) {
  let lastUser = null
  let lastAssistant = null
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (!lastAssistant && e.role === 'assistant') {
      lastAssistant = e
      continue
    }
    if (lastAssistant && e.role === 'user') {
      lastUser = e
      break
    }
  }
  return { lastUser, lastAssistant }
}

function readAccount() {
  const sentryPath = join(
    process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
    'Cursor',
    'sentry',
    'scope_v3.json',
  )
  if (!existsSync(sentryPath)) return null
  try {
    const data = JSON.parse(readFileSync(sentryPath, 'utf8'))
    return data?.scope?.user ?? data?.user ?? null
  } catch {
    return null
  }
}

function scanLogsForTokens() {
  const logsRoot = join(
    process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
    'Cursor',
    'logs',
  )
  if (!existsSync(logsRoot)) return []
  const hits = []
  const dirs = readdirSync(logsRoot)
    .map((d) => join(logsRoot, d))
    .filter((p) => existsSync(p) && statSync(p).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, 3)

  const re =
    /"(input_tokens|output_tokens|total_tokens|cache_read_tokens|cache_write_tokens|reasoning_tokens)"\s*:\s*(\d+)/g

  for (const dir of dirs) {
    walk(dir, (file) => {
      if (!file.endsWith('.log') && !file.endsWith('.json')) return
      let text
      try {
        text = readFileSync(file, 'utf8')
      } catch {
        return
      }
      if (!text.includes('input_tokens') && !text.includes('total_tokens')) return
      const chunk = text.slice(-80_000)
      let m
      const last = {}
      while ((m = re.exec(chunk)) !== null) {
        last[m[1]] = Number(m[2])
      }
      if (Object.keys(last).length) {
        hits.push({ file: file.replace(logsRoot, ''), ...last })
      }
    })
  }
  return hits.slice(-5)
}

function walk(dir, fn) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, fn)
    else fn(p)
  }
}

const projectDir = findProjectDir()
const transcriptPath = projectDir ? newestTranscript(projectDir) : null
const account = readAccount()
const logHits = scanLogsForTokens()

const report = {
  generatedAt: new Date().toISOString(),
  platform: platform(),
  cwd,
  projectDir,
  transcriptPath,
  account: account
    ? { email: account.email ?? null, id: account.id ?? null }
    : null,
  lastRound: null,
  sessionEstimate: null,
  logTokenSamples: logHits,
  limitations: [
    'Cursor Agent 的 agent-transcripts 通常不含官方计费 token 字段',
    '上一轮 token 为基于文本长度的估算（≈字符数/4），非账单数据',
    '套餐余量（fast requests）需 Cursor Settings 或 Cursor Usage 扩展',
    '上下文窗口余量请看当前对话底部状态条或 Settings → Usage',
  ],
}

if (transcriptPath) {
  const entries = parseJsonl(transcriptPath)
  const { lastUser, lastAssistant } = lastCompletedRound(entries)
  const userText = lastUser ? extractText(lastUser) : ''
  const assistantText = lastAssistant ? extractText(lastAssistant) : ''

  report.lastRound = {
    userQueryPreview: userText.replace(/<[^>]+>/g, '').slice(0, 120),
    estimatedInputTokens: estimateTokens(userText),
    estimatedOutputTokens: estimateTokens(assistantText),
    estimatedTotalTokens:
      estimateTokens(userText) + estimateTokens(assistantText),
    note: '估算值',
  }

  let totalChars = 0
  for (const e of entries) {
    totalChars += extractText(e).length
  }
  report.sessionEstimate = {
    messageCount: entries.length,
    estimatedSessionTokens: Math.ceil(totalChars / 4),
    transcriptFile: transcriptPath,
  }
}

console.log(JSON.stringify(report, null, 2))
