import os from 'node:os'
import path from 'node:path'
import z from '@deepseek-ai/schemastery'

export interface Config {
  cacheDir?: string
  requestTimeoutMs?: number
  toolTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  cacheDir: z.string().default(path.join(
    process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
    'dsh-ustc-catalog',
  )),
  requestTimeoutMs: z.number().default(15_000),
  toolTimeoutMs: z.number().default(120_000),
})

export interface ResolvedConfig {
  cacheDir: string
  requestTimeoutMs: number
  toolTimeoutMs: number
}

export function resolveConfig(input: Config): ResolvedConfig {
  const config = Config(input)
  if (!config.cacheDir!.trim()) throw new TypeError('cacheDir must not be blank')
  for (const key of ['requestTimeoutMs', 'toolTimeoutMs'] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key]! <= 0) {
      throw new TypeError(`${key} must be a positive safe integer`)
    }
  }
  // These values are added to the upstream deadline and used as Node timers.
  if (config.toolTimeoutMs! > 2_147_483_647 - 5_000 || config.requestTimeoutMs! > 2_147_483_647) {
    throw new TypeError('timeouts must fit Node.js timer limits (including the tool shutdown grace period)')
  }
  return {
    cacheDir: path.resolve(config.cacheDir!),
    requestTimeoutMs: config.requestTimeoutMs!,
    toolTimeoutMs: config.toolTimeoutMs!,
  }
}
