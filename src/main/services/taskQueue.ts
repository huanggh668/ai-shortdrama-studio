import type { AppEvent, TaskInfo } from '../../shared/types'
import { newId } from './utils'

export interface TaskHandle {
  id: string
  setProgress(progress: number, message?: string): void
  complete(message?: string): void
  fail(error: string): void
  cancel(message?: string): void
}

export class TaskQueue {
  private readonly tasks = new Map<string, TaskInfo>()
  private readonly emit: (event: AppEvent) => void

  constructor(emit: (event: AppEvent) => void) {
    this.emit = emit
  }

  create(kind: string, label: string, projectId?: string): TaskHandle {
    const task: TaskInfo = {
      id: newId('task'),
      projectId,
      kind,
      label,
      status: 'queued',
      progress: 0,
      startedAt: Date.now()
    }
    this.tasks.set(task.id, task)
    this.push(task)
    const update = (patch: Partial<TaskInfo>): void => {
      Object.assign(task, patch)
      this.push(task)
    }
    queueMicrotask(() => update({ status: 'running' }))
    return {
      id: task.id,
      setProgress: (progress, message) => {
        update({ progress: Math.max(0, Math.min(100, Math.round(progress))), message })
      },
      complete: (message) => {
        update({ status: 'done', progress: 100, message, finishedAt: Date.now() })
      },
      fail: (error) => {
        update({ status: 'failed', error, finishedAt: Date.now() })
      },
      cancel: (message) => {
        update({ status: 'cancelled', message, finishedAt: Date.now() })
      }
    }
  }

  get(id: string): TaskInfo | undefined {
    return this.tasks.get(id)
  }

  list(): TaskInfo[] {
    return Array.from(this.tasks.values())
  }

  private push(task: TaskInfo): void {
    this.emit({ type: 'task:updated', task: { ...task } })
  }
}

export async function pool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  options: {
    signal?: AbortSignal
    onProgress?: (completed: number, total: number) => void
  } = {}
): Promise<{ completed: number; failed: Array<{ index: number; error: string }> }> {
  const total = items.length
  let cursor = 0
  let completed = 0
  const failures: Array<{ index: number; error: string }> = []
  const concurrency = Math.max(1, Math.min(limit || 1, total || 1))

  const runner = async (): Promise<void> => {
    while (true) {
      if (options.signal?.aborted) throw new DOMException('已取消', 'AbortError')
      const index = cursor
      cursor += 1
      if (index >= total) return
      try {
        await worker(items[index], index)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        failures.push({
          index,
          error: error instanceof Error ? error.message : String(error)
        })
      } finally {
        completed += 1
        options.onProgress?.(completed, total)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runner()))
  return { completed, failed: failures }
}
