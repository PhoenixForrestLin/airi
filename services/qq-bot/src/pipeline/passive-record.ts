// src/pipeline/passive-record.ts
// ─────────────────────────────────────────────────────────────
// PassiveRecordStage：在 WakeStage 之前被动记录所有消息历史
// ─────────────────────────────────────────────────────────────

import type { StageResult } from '../types/context'
import type { QQMessageEvent } from '../types/event'
import type { InputMessageSegment } from '../types/message'

import { MessageBuffer } from '../utils/message-buffer'
import { PipelineStage } from './stage'

interface PassiveSessionEntry {
  buffer: MessageBuffer<InputMessageSegment[]>
  lastActive: number
}

export interface PassiveRecordConfig {
  maxHistoryPerSession: number
  timeoutMs: number
}

export class PassiveRecordStage extends PipelineStage {
  readonly name = 'PassiveRecordStage'

  private readonly buffers = new Map<string, PassiveSessionEntry>()

  constructor(private readonly config: PassiveRecordConfig) {
    super()
    this.initLogger()
  }

  async execute(event: QQMessageEvent): Promise<StageResult> {
    const key = event.source.sessionId
    const now = Date.now()

    let entry = this.buffers.get(key)
    if (!entry) {
      entry = {
        buffer: new MessageBuffer<InputMessageSegment[]>(this.config.maxHistoryPerSession),
        lastActive: now,
      }
      this.buffers.set(key, entry)
    }

    if (now - entry.lastActive > this.config.timeoutMs) {
      this.logger.debug(`Session timeout, clearing passive buffer: ${key}`)
      entry.buffer.clear()
    }

    entry.lastActive = now
    entry.buffer.push(event.chain)

    return { action: 'continue' }
  }

  getRecent(sessionId: string, n: number): InputMessageSegment[][] {
    const entry = this.buffers.get(sessionId)
    return entry ? entry.buffer.getRecent(n) : []
  }

  clearSession(sessionId: string): void {
    this.buffers.delete(sessionId)
  }
}
