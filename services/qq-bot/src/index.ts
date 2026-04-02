// src/index.ts
// ─────────────────────────────────────────────────────────────
// 入口：初始化所有模块，启动 NapLink 连接
// ─────────────────────────────────────────────────────────────

import type { GroupMessageEvent, PrivateMessageEvent } from '@naplink/naplink'

import process from 'node:process'

import { createAiriClient } from './airi-client'
import { createNapLinkClient } from './client'
import { loadConfig } from './config'
import { createDispatcher } from './dispatcher'
import { normalizeGroupMessage, normalizePrivateMessage } from './normalizer'
import { PipelineRunner } from './pipeline/runner'
import { createLogger, initLoggers } from './utils/logger'

async function main() {
  // ─── 加载配置 ──────────────────────────────────────────────
  const config = await loadConfig()

  // ─── 初始化日志（阶段二：刷新全部 logger 实例） ────────────
  initLoggers(config)
  const logger = createLogger('main')
  logger.info('Config loaded, loggers initialized')

  // ─── 创建 AIRI 连接 ────────────────────────────────────────
  const airiClient = createAiriClient(config.airi.url, config.airi.token)
  logger.info(`Connecting to AIRI server: ${config.airi.url}`)

  // ─── 初始化 NapLink ────────────────────────────────────────
  const client = createNapLinkClient(config)

  // ─── 创建 Pipeline Runner ──────────────────────────────────
  const dispatcher = createDispatcher(client, config.respond)
  const runner = new PipelineRunner(config, airiClient, dispatcher)
  let botQQ = ''

  // 获取 bot 自身 QQ 号，注入给 WakeStage（用于 @bot 检测）
  client.once('ready', async () => {
    try {
      const loginInfo = await client.getLoginInfo()
      botQQ = String(loginInfo.user_id)
      runner.setBotQQ(botQQ)
      logger.info(`Bot QQ: ${botQQ}`)
    }
    catch (err) {
      logger.error('Failed to get login info, @bot detection may not work', err as Error)
    }
  })

  // 注册消息事件 → 流水线
  client.on('message.group', (data: GroupMessageEvent) => {
    runner.run(normalizeGroupMessage(data, botQQ)).catch(
      err => logger.error('Pipeline error (group)', err as Error),
    )
  })

  client.on('message.private', (data: PrivateMessageEvent) => {
    runner.run(normalizePrivateMessage(data, botQQ)).catch(
      err => logger.error('Pipeline error (private)', err as Error),
    )
  })

  // ─── 启动 NapLink 连接 ─────────────────────────────────────
  await client.connect()
  logger.info('NapLink connected, bot is running')

  // ─── 优雅退出 ──────────────────────────────────────────────
  async function shutdown(signal: string) {
    logger.info(`Received ${signal}, shutting down...`)
    airiClient.close()
    await client.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[main] Fatal error:', err)
  process.exit(1)
})
