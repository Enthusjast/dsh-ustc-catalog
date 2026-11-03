import { accessSync, constants, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { ResolvedConfig } from './config.js'
import type { CatalogTool } from './tool-policy.js'

function catalogEntrypoint(): string {
  const require = createRequire(import.meta.url)
  let manifestPath: string
  try {
    manifestPath = require.resolve('ustc-catalog-cli/package.json')
  } catch (cause) {
    throw new Error('Install the pinned ustc-catalog-cli@0.4.0 dependency before loading ustc-catalog', { cause })
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version?: unknown
    bin?: Record<string, unknown>
  }
  const bin = manifest.bin?.['catalog-mcp']
  if (manifest.version !== '0.4.0' || typeof bin !== 'string' || !bin) {
    throw new Error('ustc-catalog requires ustc-catalog-cli@0.4.0 with its catalog-mcp bin; restore the locked dependencies')
  }
  const entry = path.resolve(path.dirname(manifestPath), bin)
  try {
    accessSync(entry, constants.R_OK)
  } catch (cause) {
    throw new Error('The installed catalog-mcp entry is missing or unreadable; restore ustc-catalog-cli@0.4.0', { cause })
  }
  return entry
}

/** One pinned local provider. The SDK owns its process, framing and shutdown. */
export class CatalogConnection {
  private readonly client: Client
  private readonly transport: StdioClientTransport
  private closing?: Promise<void>

  constructor(private readonly config: ResolvedConfig) {
    this.client = new Client(
      { name: 'dsh-ustc-catalog', version: '0.1.0' },
      { versionNegotiation: { mode: 'legacy' } },
    )
    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [catalogEntrypoint()],
      cwd: process.cwd(),
      stderr: 'inherit',
      env: {
        CATALOG_CACHE_DIR: config.cacheDir,
        CATALOG_TIMEOUT_MS: String(config.requestTimeoutMs),
        CATALOG_MCP_PROCESS_TIMEOUT_MS: String(config.toolTimeoutMs),
      },
    })
  }

  onClose(callback: () => void): void {
    this.client.onclose = callback
  }

  async discover(signal: AbortSignal): Promise<CatalogTool[]> {
    signal.throwIfAborted()
    await this.client.connect(this.transport, { signal, timeout: 10_000 })
    signal.throwIfAborted()
    const { tools } = await this.client.listTools(undefined, { signal, timeout: 10_000 })
    signal.throwIfAborted()
    return tools
  }

  async call(tool: CatalogTool, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted()
    return this.client.callTool(
      { name: tool.name, arguments: args },
      { signal, timeout: this.config.toolTimeoutMs + 3_000, toolDefinition: tool },
    )
  }

  close(): Promise<void> {
    return this.closing ??= Promise.resolve().then(() =>
      this.client.transport ? this.client.close() : this.transport.close(),
    )
  }
}
