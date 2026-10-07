import { groqModels, groqVoiceModels, groqStructured, groqTranscribe } from './groq';
import { museModels, museStructured, museTranscribe } from './muse';
import { LanguageUnavailable, validateInput, validateVoice, validateSchema, type LanguageInput, type VoiceInput } from './shared';
export { LanguageUnavailable } from './shared';
export type LanguageProvider = 'groq' | 'muse';
export type ProviderIdentity = { provider: string; model: string };

export function languageConfiguration(voice = false) {
  const provider = process.env.ASSISTANT_AI_PROVIDER ?? 'groq';
  const acknowledged = process.env.ASSISTANT_EXTERNAL_DATA_TERMS_ACKNOWLEDGED === 'true';
  const groq = provider === 'groq', muse = provider === 'muse';
  const key = groq ? process.env.GROQ_API_KEY ?? '' : muse ? process.env.MUSE_API_KEY ?? '' : '';
  const model = groq ? voice ? process.env.GROQ_TRANSCRIPTION_MODEL ?? 'whisper-large-v3' : process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b' : muse ? voice ? process.env.MUSE_TRANSCRIPTION_MODEL ?? 'muse-voice-transcribe-1.0' : process.env.MUSE_MODEL ?? 'muse-spark-1.3' : '';
  const supported = groq ? (voice ? groqVoiceModels : groqModels).includes(model) : muse && (voice ? model === 'muse-voice-transcribe-1.0' : museModels.includes(model));
  return { provider, model, key, available: Boolean(key.trim() && acknowledged && supported), label: groq ? 'Groq' : muse ? 'Meta Muse' : 'Unconfigured provider', voiceFormat: muse ? 'wav' as const : 'native' as const };
}
export function languageProviderAvailable(voice = false) { return languageConfiguration(voice).available; }
export function hasLanguageConsent(prefs: any) { return Boolean(prefs?.external_ai_enabled && prefs.external_ai_provider === languageConfiguration().provider); }

function configuration(voice: boolean, expected?: ProviderIdentity) {
  const config = languageConfiguration(voice);
  if (!config.available) throw new LanguageUnavailable();
  if (expected && (expected.provider !== config.provider || expected.model !== config.model)) throw new LanguageUnavailable('AI_PROVIDER_CHANGED',409);
  return config;
}
export async function languageStructured(input: LanguageInput, transport: typeof fetch = fetch, expected?: ProviderIdentity) {
  validateInput(input); const config = configuration(false,expected);
  const result = config.provider === 'groq' ? await groqStructured(input,config,transport) : await museStructured(input,config,transport);
  validateSchema(result,input.schema); return result;
}
export async function languageTranscribe(input: VoiceInput, transport: typeof fetch = fetch, expected?: ProviderIdentity) {
  validateVoice(input); const config = configuration(true,expected);
  return config.provider === 'groq' ? groqTranscribe(input,config,transport) : museTranscribe(input,config,transport);
}
