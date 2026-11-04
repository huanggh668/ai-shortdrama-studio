import { describe, expect, it } from 'vitest'
import { extractJson, tryParseJson } from '../src/main/services/pipeline/json'

describe('extractJson', () => {
  it('parses plain json', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('strips markdown fences and surrounding prose', () => {
    const raw = '好的，下面是结果：\n```json\n{"shots":[{"scene":"办公室"}]}\n```\n希望有帮助'
    expect(extractJson(raw)).toEqual({ shots: [{ scene: '办公室' }] })
  })

  it('handles braces inside strings', () => {
    const raw = '{"text":"他说 {别动}","ok":true}'
    expect(extractJson(raw)).toEqual({ text: '他说 {别动}', ok: true })
  })

  it('repairs trailing commas', () => {
    expect(extractJson('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] })
  })

  it('normalizes smart quotes', () => {
    expect(extractJson('{“a”:1}')).toEqual({ a: 1 })
  })

  it('returns a failure instead of throwing in tryParseJson', () => {
    const result = tryParseJson('not json at all')
    expect(result.ok).toBe(false)
  })
})
