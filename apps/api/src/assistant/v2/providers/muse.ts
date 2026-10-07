import { LanguageUnavailable, providerJson, structuredContent, transcript, type LanguageInput, type VoiceInput } from './shared';

/** Standard models only: Contributor models permit training on submitted content. */
export const museModels = ['muse-spark-1.3', 'muse-spark-1.2', 'muse-spark-1.1'];

export async function museStructured(input: LanguageInput, config: { key: string; model: string }, transport: typeof fetch) {
  return structuredContent(await providerJson('https://api.meta.ai/v1/chat/completions', {
    method: 'POST', signal: input.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: input.instruction }, { role: 'user', content: input.text }], stream: false, reasoning_effort: 'low', max_completion_tokens: 2048, response_format: { type: 'json_schema', json_schema: { name: 'capy_language_result', strict: true, schema: input.schema } } })
  }, transport));
}

/** Muse requires a mono 16-bit PCM RIFF/WAVE container at 16 or 24 kHz. */
export function validateMuseWav(input: VoiceInput) {
  const bytes = input.bytes, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number) => new TextDecoder().decode(bytes.subarray(offset, offset + 4));
  if (input.mimeType !== 'audio/wav' || bytes.length < 44 || text(0) !== 'RIFF' || text(8) !== 'WAVE' || view.getUint32(4,true) + 8 !== bytes.length) throw new RangeError('Muse voice requires a PCM WAV recording.');
  let rate = 0, format = false, dataSize = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4,true), start = offset + 8;
    if (start + size > bytes.length) throw new RangeError('The WAV recording is incomplete.');
    if (text(offset) === 'fmt ') {
      if (size < 16 || view.getUint16(start,true) !== 1 || view.getUint16(start+2,true) !== 1 || view.getUint16(start+14,true) !== 16 || view.getUint16(start+12,true) !== 2) throw new RangeError('Muse voice requires mono 16-bit PCM.');
      rate = view.getUint32(start+4,true); if (![16000,24000].includes(rate) || view.getUint32(start+8,true) !== rate * 2) throw new RangeError('Muse voice requires 16 or 24 kHz PCM.');
      format = true;
    } else if (text(offset) === 'data') dataSize += size;
    offset = start + size + (size % 2);
  }
  if (!format || !dataSize || dataSize % 2 || dataSize / (rate * 2) > 30) throw new RangeError('Record up to 30 seconds of PCM WAV audio.');
}

export async function museTranscribe(input: VoiceInput, config: { key: string; model: string }, transport: typeof fetch) {
  validateMuseWav(input);
  if (config.model !== 'muse-voice-transcribe-1.0') throw new LanguageUnavailable();
  const form = new FormData();
  form.set('request', new Blob([JSON.stringify({ model: config.model, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK', languageBias: ['English','Indonesian'] })], { type: 'application/json' }));
  form.set('audio', new Blob([Uint8Array.from(input.bytes)], { type: 'audio/wav' }), 'recording.wav');
  const result = await providerJson('https://api.meta.ai/v1/asr/transcribe', { method: 'POST', signal: input.signal, headers: { Authorization: `Bearer ${config.key}`, Accept: 'application/json' }, body: form }, transport);
  return transcript(result?.transcript);
}
