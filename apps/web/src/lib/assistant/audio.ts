/** Mono 24 kHz, 16-bit PCM WAV required by Meta Muse's ASR endpoint. */
export function encodePcmWav(samples: Float32Array, rate = 24000): Blob {
  if (![16000, 24000].includes(rate) || !samples.length || samples.length > rate * 30) throw new RangeError('Record up to 30 seconds of audio.');
  const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
  const tag = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  tag(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const value = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0; view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true); }
  return new Blob([bytes], {type: 'audio/wav'});
}

export async function recordingToWav(recording: Blob): Promise<Blob> {
  if (!recording.size || recording.size > 2000000) throw new RangeError('Record a shorter message.');
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(await recording.arrayBuffer());
    if (!decoded.duration || decoded.duration > 30.5) throw new RangeError('Record up to 30 seconds of audio.');
    // MediaRecorder can include a few milliseconds of codec padding at its stop boundary.
    const length = Math.min(24000 * 30, Math.ceil(decoded.duration * 24000));
    const renderer = new OfflineAudioContext(1, length, 24000), source = renderer.createBufferSource();
    source.buffer = decoded; source.connect(renderer.destination); source.start();
    return encodePcmWav((await renderer.startRendering()).getChannelData(0));
  } finally { await decoder.close(); }
}
