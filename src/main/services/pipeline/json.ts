export function extractJson(raw: string): unknown {
  let text = raw.trim().replace(/^﻿/, '')
  text = text.replace(/```(?:json|JSON)?/g, '').replace(/```/g, '').trim()
  const start = firstBracket(text)
  if (start < 0) throw new Error(`模型输出中没有 JSON：${text.slice(0, 160)}`)
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) {
        const candidate = text.slice(start, i + 1)
        return JSON.parse(sanitize(candidate))
      }
    }
  }
  return JSON.parse(sanitize(text.slice(start)))
}

export function tryParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: extractJson(raw) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function sanitize(text: string): string {
  return text
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
}

function firstBracket(text: string): number {
  const objectStart = text.indexOf('{')
  const arrayStart = text.indexOf('[')
  if (objectStart < 0) return arrayStart
  if (arrayStart < 0) return objectStart
  return Math.min(objectStart, arrayStart)
}
