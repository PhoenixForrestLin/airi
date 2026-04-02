import type { CommandsConfig } from '../config'
import type { CommandHandler } from './types'

import { clearCommand } from './clear'
import { helpCommand } from './help'
import { statusCommand } from './status'

export interface CommandRegistry {
  prefix: string
  handlers: Map<string, CommandHandler>
}

const BUILTIN_COMMANDS: Record<string, CommandHandler> = {
  clear: clearCommand,
  help: helpCommand,
  status: statusCommand,
}

export function createCommandRegistry(config: CommandsConfig): CommandRegistry {
  const handlers = new Map<string, CommandHandler>()
  for (const commandName of config.enabled) {
    const handler = BUILTIN_COMMANDS[commandName]
    if (handler)
      handlers.set(commandName, handler)
  }

  return {
    prefix: config.prefix,
    handlers,
  }
}
