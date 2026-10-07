import { providerJson, structuredContent, transcript, type LanguageInput, type VoiceInput } from './shared';

export const groqModels = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];
export const groqVoiceModels = ['whisper-large-v3', 'whisper-large-v3-turbo'];

export async function groqStructured(input: LanguageInput, config: { key: string; model: string }, transport: typeof fetch) {
  return structuredContent(await providerJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', signal: input.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: input.instruction }, { role: 'user', content: input.text }], stream: false, reasoning_effort: 'low', max_completion_tokens: 2048, response_format: { type: 'json_schema', json_schema: { name: 'capy_language_result', strict: true, schema: input.schema } } })
  }, transport));
}

export async function groqTranscribe(input: VoiceInput, config: { key: string; model: string }, transport: typeof fetch) {
  const extension = { 'audio/webm':'webm', 'audio/ogg':'ogg', 'audio/wav':'wav', 'audio/mp4':'mp4' }[input.mimeType] ?? 'webm';
  const form = new FormData();
  form.set('file', new Blob([Uint8Array.from(input.bytes)], { type: input.mimeType }), `recording.${extension}`);
  form.set('model', config.model); form.set('response_format', 'json'); form.set('temperature', '0');
  const result = await providerJson('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', signal: input.signal, headers: { Authorization: `Bearer ${config.key}` }, body: form }, transport);
  return transcript(result?.text);
}
