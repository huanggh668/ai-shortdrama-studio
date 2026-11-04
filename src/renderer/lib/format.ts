import type { AssetStatus, StageStatus } from '@shared/types'

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 秒'
  if (seconds < 60) return `${seconds.toFixed(1).replace(/\.0$/, '')} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes} 分 ${rest} 秒`
}

export function formatMinutes(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return minutes > 0 ? `${minutes}分${rest}秒` : `${rest}秒`
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function stageTone(status: StageStatus): string {
  switch (status) {
    case 'done':
      return 'badge-green'
    case 'running':
      return 'badge-amber'
    case 'failed':
      return 'badge-red'
    case 'stale':
      return 'badge-violet'
    default:
      return 'badge-gray'
  }
}

export function stageLabel(status: StageStatus): string {
  const map: Record<StageStatus, string> = {
    idle: '待开始',
    running: '进行中',
    done: '已完成',
    failed: '失败',
    stale: '待更新',
    skipped: '已跳过'
  }
  return map[status] ?? status
}

export function assetTone(status: AssetStatus): string {
  switch (status) {
    case 'done':
      return 'badge-green'
    case 'running':
      return 'badge-amber'
    case 'failed':
      return 'badge-red'
    case 'stale':
      return 'badge-violet'
    case 'skipped':
      return 'badge-gray'
    default:
      return 'badge-gray'
  }
}

export function assetLabel(status: AssetStatus): string {
  const map: Record<AssetStatus, string> = {
    pending: '待生成',
    running: '生成中',
    done: '就绪',
    stale: '待更新',
    failed: '失败',
    skipped: '跳过'
  }
  return map[status] ?? status
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
