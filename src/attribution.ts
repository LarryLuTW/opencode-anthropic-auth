import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { USER_AGENT } from './constants.ts'

const SALT = '59cf53e54c78'
const POSITIONS = [4, 7, 20] as const

type TextBlock = { type: string; text?: string; [key: string]: unknown }
type Message = { role: string; content: string | TextBlock[] }
type Body = {
  system?: string | TextBlock[]
  messages?: Message[]
  [key: string]: unknown
}

// Match the version installed by the official CLI. The packaged user agent
// supplies a fallback for machines without a native Claude Code install.
export function claudeCodeVersion(): string {
  try {
    const version = basename(realpathSync(join(homedir(), '.local/bin/claude')))
    if (/^\d+\.\d+\.\d+$/.test(version)) return version
  } catch {
    // Fall back to the version in the packaged user agent.
  }
  const version = /^claude-cli\/(\d+\.\d+\.\d+)/.exec(USER_AGENT)?.[1]
  if (!version) throw new Error('Cannot determine Claude Code version')
  return version
}

export function billingHeader(messages: Message[], version: string): string {
  const user = messages.find((message) => message.role === 'user')
  const content = user?.content
  const text =
    typeof content === 'string'
      ? content
      : (content?.find((block) => block.type === 'text')?.text ?? '')
  const chars = POSITIONS.map((index) => text[index] || '0').join('')
  const suffix = createHash('sha256')
    .update(`${SALT}${chars}${version}`)
    .digest('hex')
    .slice(0, 3)
  return `x-anthropic-billing-header: cc_version=${version}.${suffix}; cc_entrypoint=sdk-cli;`
}

export function addBillingHeader(body: Body, version: string): boolean {
  if (
    !Array.isArray(body.messages) ||
    (body.system !== undefined &&
      typeof body.system !== 'string' &&
      !Array.isArray(body.system))
  )
    throw new Error('Unexpected Anthropic request shape')

  const system =
    typeof body.system === 'string'
      ? [{ type: 'text', text: body.system }]
      : (body.system ?? [])
  if (
    system.some(
      (block) =>
        block.type === 'text' &&
        block.text?.startsWith('x-anthropic-billing-header:'),
    )
  )
    return false

  body.system = [
    { type: 'text', text: billingHeader(body.messages, version) },
    ...system,
  ]
  return true
}

export async function addBillingHeaderToRequest(
  original: Request,
  version: string,
): Promise<Request> {
  const body = (await original.clone().json()) as Body
  if (!addBillingHeader(body, version)) return original

  const headers = new Headers(original.headers)
  headers.delete('content-length')
  return new Request(original, { headers, body: JSON.stringify(body) })
}
