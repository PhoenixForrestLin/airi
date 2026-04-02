// src/pipeline/session.ts
// ─────────────────────────────────────────────────────────────
// ⑤ ContextInjectStage：注入会话历史上下文
// ─────────────────────────────────────────────────────────────

import type { SessionConfig } from '../config'
import type { StageResult } from '../types/context'
import type { QQMessageEvent } from '../types/event'
import type { PassiveRecordStage } from './passive-record'

import { PipelineStage } from './stage'

export class ContextInjectStage extends PipelineStage {
  readonly name = 'ContextInjectStage'

  constructor(
    private readonly config: SessionConfig,
    private readonly passiveRecord: PassiveRecordStage,
  ) {
    super()
    this.initLogger()
  }

  async execute(event: QQMessageEvent): Promise<StageResult> {
    event.context.sessionHistory = this.passiveRecord.getRecent(
      event.source.sessionId,
      this.config.contextWindow,
    )

    return { action: 'continue' }
  }

  clearSession(sessionId: string): void {
    this.passiveRecord.clearSession(sessionId)
  }
}
