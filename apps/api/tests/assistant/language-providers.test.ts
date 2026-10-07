import {test,expect,beforeEach,afterEach} from 'bun:test';
import {languageConfiguration,hasLanguageConsent,languageStructured,languageTranscribe} from '../../src/assistant/v2/providers';
import {readToolSchema} from '../../src/assistant/v2/contracts';
import {validateMuseWav} from '../../src/assistant/v2/providers/muse';
import {encodePcmWav} from '../../../web/src/lib/assistant/audio';

const names=['ASSISTANT_AI_PROVIDER','ASSISTANT_EXTERNAL_DATA_TERMS_ACKNOWLEDGED','GROQ_API_KEY','GROQ_MODEL','GROQ_TRANSCRIPTION_MODEL','MUSE_API_KEY','MUSE_MODEL','MUSE_TRANSCRIPTION_MODEL'];
let original: Record<string,string|undefined>;
beforeEach(()=>{original=Object.fromEntries(names.map(name=>[name,process.env[name]]));for(const name of names)delete process.env[name];Object.assign(process.env,{ASSISTANT_AI_PROVIDER:'groq',ASSISTANT_EXTERNAL_DATA_TERMS_ACKNOWLEDGED:'true',GROQ_API_KEY:'fixture-private-key',MUSE_API_KEY:'fixture-meta-key'});});
afterEach(()=>{for(const name of names){if(original[name]===undefined)delete process.env[name];else process.env[name]=original[name];}});
const selection={tool:'spending',category:'Food',period:'this_month'};
const input={instruction:'Choose only a read-only tool.',text:'Food spending this month?',schema:readToolSchema};
const completion=(value:unknown=selection)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
function transport(fn:(url:string,init:RequestInit)=>Response|Promise<Response>):typeof fetch{return ((url:any,init:any)=>fn(String(url),init)) as typeof fetch;}
async function wav(){return new Uint8Array(await encodePcmWav(new Float32Array(24000)).arrayBuffer());}

test('Groq uses fixed endpoint, strict schema and only submitted text',async()=>{
 let calls=0;
 const result=await languageStructured(input,transport((url,init)=>{calls++;expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');expect(init.redirect).toBe('error');expect(init.signal).toBeInstanceOf(AbortSignal);expect(new Headers(init.headers).get('authorization')).toBe('Bearer fixture-private-key');const body=JSON.parse(String(init.body));expect(body.model).toBe('openai/gpt-oss-20b');expect(body.response_format.json_schema).toMatchObject({strict:true,schema:readToolSchema});expect(body.messages).toEqual([{role:'system',content:input.instruction},{role:'user',content:input.text}]);expect(body.stream).toBe(false);return completion();}));
 expect(result).toEqual(selection);expect(calls).toBe(1);
});
test('Muse uses its OpenAI-compatible text endpoint and standard model',async()=>{
 process.env.ASSISTANT_AI_PROVIDER='muse';
 expect(await languageStructured(input,transport((url,init)=>{expect(url).toBe('https://api.meta.ai/v1/chat/completions');expect(new Headers(init.headers).get('authorization')).toBe('Bearer fixture-meta-key');const body=JSON.parse(String(init.body));expect(body.model).toBe('muse-spark-1.3');expect(body.response_format.json_schema.strict).toBe(true);expect(body.max_completion_tokens).toBe(2048);expect(body.store).toBeUndefined();return completion();}))).toEqual(selection);
});
test('a provider change needs fresh consent and rejects a pinned old request before network',async()=>{
 const prefs={external_ai_enabled:true,external_ai_provider:'groq'};expect(hasLanguageConsent(prefs)).toBe(true);process.env.ASSISTANT_AI_PROVIDER='muse';expect(hasLanguageConsent(prefs)).toBe(false);let calls=0;
 await expect(languageStructured(input,transport(()=>{calls++;return completion();}),{provider:'groq',model:'openai/gpt-oss-20b'})).rejects.toMatchObject({code:'AI_PROVIDER_CHANGED',status:409});expect(calls).toBe(0);
});
test('missing terms acknowledgement and Contributor models never make requests',async()=>{
 let calls=0;const fake=transport(()=>{calls++;return completion();});process.env.ASSISTANT_EXTERNAL_DATA_TERMS_ACKNOWLEDGED='false';await expect(languageStructured(input,fake)).rejects.toThrow();process.env.ASSISTANT_EXTERNAL_DATA_TERMS_ACKNOWLEDGED='true';process.env.ASSISTANT_AI_PROVIDER='muse';process.env.MUSE_MODEL='muse-spark-1.3-contributor';expect(languageConfiguration().available).toBe(false);await expect(languageStructured(input,fake)).rejects.toThrow();expect(calls).toBe(0);
});
test('unknown provider and unsupported models fail closed',async()=>{
 process.env.ASSISTANT_AI_PROVIDER='unknown';expect(languageConfiguration().available).toBe(false);process.env.ASSISTANT_AI_PROVIDER='groq';process.env.GROQ_MODEL='arbitrary-model';expect(languageConfiguration().available).toBe(false);delete process.env.GROQ_MODEL;process.env.GROQ_TRANSCRIPTION_MODEL='arbitrary-voice';expect(languageConfiguration(true).available).toBe(false);
});
test('invalid structured fields are rejected locally for both providers',async()=>{
 for(const provider of ['groq','muse']){process.env.ASSISTANT_AI_PROVIDER=provider;for(const value of [{...selection,tool:'sql'},{...selection,accountId:'other'}, {tool:'spending'}, {...selection,category:'x'.repeat(101)}])await expect(languageStructured(input,transport(()=>completion(value)))).rejects.toThrow();}
});
test('refusal, truncation, tool calls and malformed JSON cannot become finance instructions',async()=>{
 for(const choice of [{finish_reason:'length',message:{content:'{}'}},{finish_reason:'stop',message:{refusal:'no',content:'{}'}},{finish_reason:'stop',message:{tool_calls:[{}],content:'{}'}},{finish_reason:'stop',message:{content:'not json'}}])await expect(languageStructured(input,transport(()=>Response.json({choices:[choice]})))).rejects.toThrow();
});
test('provider throttling is sanitized without retry or fallback',async()=>{
 let calls=0;try{await languageStructured(input,transport(()=>{calls++;return new Response('fixture-private-key secret body',{status:429});}));throw new Error('Expected rejection');}catch(error){expect(error).toMatchObject({code:'AI_PROVIDER_RATE_LIMITED',status:429});expect(String(error)).not.toContain('fixture-private-key');}expect(calls).toBe(1);
});
test('oversized provider response and redirect failure are rejected',async()=>{
 await expect(languageStructured(input,transport(()=>new Response('x'.repeat(65537))))).rejects.toThrow();await expect(languageStructured(input,transport(()=>{throw new TypeError('redirect');}))).rejects.toThrow();
});
test('caller cancellation reaches the provider signal',async()=>{
 const controller=new AbortController();controller.abort();await expect(languageStructured({...input,signal:controller.signal},transport((_,init)=>{expect(init.signal?.aborted).toBe(true);throw init.signal?.reason;}))).rejects.toThrow();
});
test('Groq voice uses multipart file and its separate transcription model',async()=>{
 expect(await languageTranscribe({mimeType:'audio/webm',bytes:new Uint8Array([1,2,3])},transport((url,init)=>{expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');const form=init.body as FormData;expect(form.get('model')).toBe('whisper-large-v3');expect((form.get('file') as File).name).toBe('recording.webm');expect(new Headers(init.headers).has('content-type')).toBe(false);return Response.json({text:'  makan 45k hari ini  '});}))).toEqual({transcript:'makan 45k hari ini'});
});
test('Muse voice uses documented ASR multipart request and PCM WAV',async()=>{
 process.env.ASSISTANT_AI_PROVIDER='muse';
 expect(await languageTranscribe({mimeType:'audio/wav',bytes:await wav()},transport(async(url,init)=>{expect(url).toBe('https://api.meta.ai/v1/asr/transcribe');const form=init.body as FormData;expect(JSON.parse(await (form.get('request') as Blob).text())).toEqual({model:'muse-voice-transcribe-1.0',audioEncoding:'WAV',mode:'PUSH_TO_TALK',languageBias:['English','Indonesian']});expect((form.get('audio') as File).type).toBe('audio/wav');return Response.json({transcript:'Lunch 45k today',audioDurationMs:1000});}))).toEqual({transcript:'Lunch 45k today'});
});
test('compressed or invalid Muse WAV is rejected before upload',async()=>{
 process.env.ASSISTANT_AI_PROVIDER='muse';let calls=0;await expect(languageTranscribe({mimeType:'audio/webm',bytes:new Uint8Array([1])},transport(()=>{calls++;return Response.json({});}))).rejects.toThrow();const bytes=await wav(),view=new DataView(bytes.buffer);view.setUint16(22,2,true);expect(()=>validateMuseWav({mimeType:'audio/wav',bytes})).toThrow();expect(calls).toBe(0);
});
test('WAV encoder clips samples and produces a bounded valid Muse recording',async()=>{
 const bytes=new Uint8Array(await encodePcmWav(new Float32Array([-2,0,2,NaN])).arrayBuffer()),view=new DataView(bytes.buffer);expect(view.getInt16(44,true)).toBe(-32768);expect(view.getInt16(48,true)).toBe(32767);expect(view.getInt16(50,true)).toBe(0);expect(()=>validateMuseWav({mimeType:'audio/wav',bytes})).not.toThrow();expect(()=>encodePcmWav(new Float32Array(24000*30+1))).toThrow();
});
test('empty or oversized transcripts and unsupported audio uploads are rejected',async()=>{
 for(const text of ['', 'x'.repeat(2001)])await expect(languageTranscribe({mimeType:'audio/webm',bytes:new Uint8Array([1])},transport(()=>Response.json({text})))).rejects.toThrow();await expect(languageTranscribe({mimeType:'image/png',bytes:new Uint8Array([1])},transport(()=>Response.json({text:'no'})))).rejects.toThrow();
});
