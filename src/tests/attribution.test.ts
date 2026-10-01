import { describe, expect, test } from 'bun:test'
import {
  addBillingHeader,
  addBillingHeaderToRequest,
  billingHeader,
  claudeCodeVersion,
} from '../attribution.ts'

describe('Claude Code billing header', () => {
  test('matches the billing block captured from Claude Code 2.1.286', () => {
    expect(
      billingHeader(
        [{ role: 'user', content: 'Reply with the single word: ok' }],
        '2.1.286',
      ),
    ).toBe(
      'x-anthropic-billing-header: cc_version=2.1.286.940; cc_entrypoint=sdk-cli;',
    )
  })

  test('uses the first text block of the first user message', () => {
    expect(
      billingHeader(
        [
          { role: 'assistant', content: 'Hello' },
          {
            role: 'user',
            content: [
              { type: 'image' },
              { type: 'text', text: 'Reply with the single word: ok' },
            ],
          },
        ],
        '2.1.286',
      ),
    ).toContain('cc_version=2.1.286.940')
    expect(billingHeader([], '2.1.286')).toContain('cc_version=2.1.286.45c')
  })

  test('prepends the billing block and preserves cache blocks and messages', () => {
    const body = {
      model: 'claude-opus-5-5',
      system: [
        {
          type: 'text',
          text: 'You are a Claude agent',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    }
    const before = structuredClone(body)
    expect(addBillingHeader(body, '2.1.286')).toBe(true)
    expect(body.system[0]?.text).toBe(
      'x-anthropic-billing-header: cc_version=2.1.286.940; cc_entrypoint=sdk-cli;',
    )
    expect(body.system.slice(1)).toEqual(before.system)
    expect(body.messages).toEqual(before.messages)
    expect(body.model).toBe(before.model)
    expect(addBillingHeader(body, '2.1.286')).toBe(false)
    expect(body.system).toHaveLength(2)
  })

  test('handles auxiliary requests with no system prompt', () => {
    const body: {
      system?: Array<{ type: string; text: string }>
      messages: Array<{ role: string; content: string }>
    } = { messages: [{ role: 'user', content: 'title' }] }
    expect(addBillingHeader(body, '2.1.286')).toBe(true)
    expect(body.system).toEqual([
      { type: 'text', text: billingHeader(body.messages, '2.1.286') },
    ])
  })

  test('keeps auth, other fields and the original one-shot body intact', async () => {
    const body = {
      system: [{ type: 'text', text: 'identity' }],
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'read' }],
    }
    const original = new Request(
      'https://api.anthropic.com/v1/messages?beta=true',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
          'content-length': '1',
        },
        body: JSON.stringify(body),
      },
    )
    const rewritten = await addBillingHeaderToRequest(original, '2.1.286')
    expect(await addBillingHeaderToRequest(rewritten, '2.1.286')).toBe(
      rewritten,
    )
    const sent = (await rewritten.json()) as {
      system: Array<{ text: string }>
      tools: Array<{ name: string }>
    }
    expect(sent.system[0]?.text).toStartWith('x-anthropic-billing-header:')
    expect(sent.tools).toEqual(body.tools)
    expect(rewritten.headers.get('authorization')).toBe('Bearer test-token')
    expect(rewritten.headers.get('content-length')).toBeNull()
    expect(await original.json()).toEqual(body)
  })

  test('uses the installed Claude Code version or packaged fallback', () => {
    expect(claudeCodeVersion()).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
