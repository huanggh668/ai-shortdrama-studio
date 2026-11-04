import type { TestResult, TextProviderSettings } from '../../../shared/types'
import type { ProviderTest, TextProvider, TextRequest } from './types'

export class OpenAiTextProvider implements TextProvider {
  readonly id = 'openai-text'
  private readonly cfg: TextProviderSettings

  constructor(cfg: TextProviderSettings) {
    this.cfg = cfg
  }

  async complete(req: TextRequest): Promise<string> {
    if (!this.cfg.apiKey) throw new Error('未配置剧本模型的 API Key')
    const body: Record<string, unknown> = {
      model: this.cfg.model || 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt }
      ],
      temperature: req.temperature ?? this.cfg.temperature ?? 0.8
    }
    if (req.maxTokens) body.max_tokens = req.maxTokens
    if (req.json) body.response_format = { type: 'json_object' }

    let response = await fetch(this.url('/chat/completions'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: req.signal
    })

    if (!response.ok && req.json && (response.status === 400 || response.status === 422)) {
      delete body.response_format
      response = await fetch(this.url('/chat/completions'), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: req.signal
      })
    }

    if (!response.ok) {
      throw new Error(`剧本模型请求失败 (${response.status})：${(await response.text()).slice(0, 400)}`)
    }
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> } }>
    }
    const content = json.choices?.[0]?.message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.map((part) => part.text ?? '').join('')
    }
    throw new Error('剧本模型返回为空')
  }

  async test(): Promise<ProviderTest> {
    const result: TestResult = { ok: false, message: '' }
    try {
      const text = await this.complete({
        system: '你是一个测试助手。',
        prompt: '只回复两个字：正常',
        temperature: 0,
        maxTokens: 16
      })
      result.ok = Boolean(text.trim())
      result.message = `连接成功，模型返回：${text.trim().slice(0, 40)}`
    } catch (error) {
      result.message = error instanceof Error ? error.message : String(error)
    }
    return result
  }

  private url(path: string): string {
    return `${this.cfg.baseUrl.replace(/\/+$/, '')}${path}`
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.cfg.apiKey}`
    }
  }
}
