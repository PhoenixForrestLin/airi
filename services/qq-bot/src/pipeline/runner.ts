// src/pipeline/runner.ts
// ─────────────────────────────────────────────────────────────
// 流水线执行引擎：Filter -> PassiveRecord -> Wake -> RateLimit -> ContextInject -> Process -> Decorate -> Respond
// ─────────────────────────────────────────────────────────────

import type { AiriClient } from '../airi-client'
import type { BotConfig } from '../config'
import type { ResponseDispatcher } from '../dispatcher'
import type { QQMessageEvent } from '../types/event'
import type { PipelineStage } from './stage'

import { createLogger } from '../utils/logger'
import { DecorateStage } from './decorate'
import { FilterStage } from './filter'
import { PassiveRecordStage } from './passive-record'
import { ProcessStage } from './process'
import { RateLimitStage } from './rate-limit'
import { RespondStage } from './respond'
import { ContextInjectStage } from './session'
import { WakeStage } from './wake'

const logger = createLogger('runner')

export class PipelineRunner {
  private botQQ = ''
  private readonly stages: PipelineStage[]

  private readonly passiveRecordStage: PassiveRecordStage
  private readonly rateLimitStage: RateLimitStage
  private readonly contextInjectStage: ContextInjectStage
  private readonly processStage: ProcessStage

  constructor(
    config: BotConfig,
    airiClient: AiriClient,
    private readonly dispatcher: ResponseDispatcher,
  ) {
    this.passiveRecordStage = new PassiveRecordStage({
      maxHistoryPerSession: config.session.maxHistoryPerSession,
      timeoutMs: config.session.timeoutMs,
    })
    this.rateLimitStage = new RateLimitStage(config.rateLimit)
    this.contextInjectStage = new ContextInjectStage(config.session, this.passiveRecordStage)
    this.processStage = new ProcessStage(config.process, airiClient)

    this.stages = [
      new FilterStage(config.filter),
      this.passiveRecordStage,
      new WakeStage(config.wake),
      this.rateLimitStage,
      this.contextInjectStage,
      this.processStage,
      new DecorateStage(config.decorate),
      new RespondStage(),
    ]
  }

  setBotQQ(botQQ: string): void {
    this.botQQ = botQQ
  }

  async run(event: QQMessageEvent): Promise<void> {
    event.context.extensions._botQQ = this.botQQ

    for (const stage of this.stages) {
      try {
        const result = await stage.run(event)

        if (result.action === 'skip')
          return

        if (result.action === 'respond') {
          if ((event.context.extensions as { _clearSession?: boolean })._clearSession)
            this.clearSession(event.source.sessionId)

          await this.dispatcher.send(event, result.payload)
          if (event.context.rateLimitPassed)
            this.rateLimitStage.startCooldown(event.source.sessionId)
          return
        }

        if (event.stopped)
          return
      }
      catch (err) {
        logger.error(`Stage failed: ${stage.name} (event=${event.id})`, err as Error)
        return
      }
    }

    if (event.context.response) {
      if ((event.context.extensions as { _clearSession?: boolean })._clearSession)
        this.clearSession(event.source.sessionId)

      await this.dispatcher.send(event, event.context.response)
      if (event.context.rateLimitPassed)
        this.rateLimitStage.startCooldown(event.source.sessionId)
    }
    else {
      logger.debug(`No response generated for event ${event.id}`)
    }
  }

  clearSession(sessionId: string): void {
    this.passiveRecordStage.clearSession(sessionId)
  }
}
