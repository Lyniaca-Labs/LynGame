export function mixBuffers(buffers, gains) {
  if (!buffers.length) return new Float32Array(0);
  const length = Math.max(...buffers.map((b) => b.length));
  const out = new Float32Array(length);

  buffers.forEach((buf, i) => {
    const gain = gains && gains[i] !== undefined ? gains[i] : 1;
    for (let j = 0; j < buf.length; j++) out[j] += buf[j] * gain;
  });

  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}
