export type LanguageInput = { instruction: string; text: string; schema: Record<string, unknown>; signal?: AbortSignal };
export type VoiceInput = { mimeType: string; bytes: Uint8Array; signal?: AbortSignal };
export class LanguageUnavailable extends Error {
  constructor(public code = 'AI_PROVIDER_UNAVAILABLE', public status = 503) {
    super('Language processing is unavailable. Local calculations and manual entry still work.');
  }
}

/** Never expose provider error bodies, keys or submitted content to logs or clients. */
export async function providerJson(url: string, init: RequestInit, transport: typeof fetch): Promise<any> {
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  const response = await transport(url, { ...init, signal, redirect: 'error' });
  if (!response.ok) {
    await response.body?.cancel();
    throw new LanguageUnavailable(response.status === 429 ? 'AI_PROVIDER_RATE_LIMITED' : 'AI_PROVIDER_UNAVAILABLE', response.status === 429 ? 429 : 503);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new LanguageUnavailable();
  let size = 0, body = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) { await reader.cancel(); throw new LanguageUnavailable(); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch { throw new LanguageUnavailable(); }
  finally { reader.releaseLock(); }
}

export function structuredContent(result: any): unknown {
  if (!Array.isArray(result?.choices) || result.choices.length !== 1) throw new LanguageUnavailable();
  const choice = result.choices[0], message = choice?.message;
  if (choice?.finish_reason !== 'stop' || message?.refusal || message?.tool_calls?.length || typeof message?.content !== 'string' || message.content.length > 8_000) throw new LanguageUnavailable();
  try { return JSON.parse(message.content); } catch { throw new LanguageUnavailable(); }
}

export function transcript(value: unknown): { transcript: string } {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_000) throw new LanguageUnavailable();
  return { transcript: value.trim() };
}

export function validateInput(input: LanguageInput) {
  if (!input.text.trim() || input.text.length > 4_000 || input.instruction.length > 8_000) throw new RangeError('Language input is too large or empty.');
}

export function validateVoice(input: VoiceInput) {
  if (!input.bytes.length || input.bytes.length > 2_000_000 || !['audio/webm','audio/ogg','audio/wav','audio/mp4'].includes(input.mimeType)) throw new RangeError('Use a supported recording up to 2 MB.');
}

/** Validate the subset used by CapyBudget even when a provider claims strict output. */
export function validateSchema(value: unknown, schema: Record<string, any>): void {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LanguageUnavailable();
    const object = value as Record<string, unknown>, properties = schema.properties ?? {};
    if ((schema.required ?? []).some((key: string) => !(key in object))) throw new LanguageUnavailable();
    for (const key of Object.keys(object)) {
      if (!(key in properties)) { if (schema.additionalProperties === false) throw new LanguageUnavailable(); }
      else validateSchema(object[key], properties[key]);
    }
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || schema.maxLength !== undefined && value.length > schema.maxLength || schema.enum && !schema.enum.includes(value)) throw new LanguageUnavailable();
  } else throw new RangeError('Unsupported language response schema.');
}
