import test from "node:test";
import assert from "node:assert/strict";
import { encodeWav, bufferToDataUrl } from "../frontend/js/wav.mjs";

test("encodeWav produces the correct byte length", () => {
  const samples = new Float32Array(1000);
  const buf = encodeWav(samples, 44100);
  assert.equal(buf.byteLength, 44 + 1000 * 2);
});

test("encodeWav writes a valid RIFF/WAVE header", () => {
  const buf = encodeWav(new Float32Array(10), 44100);
  const view = new DataView(buf);
  const readStr = (offset, len) => String.fromCharCode(...new Uint8Array(buf, offset, len));
  assert.equal(readStr(0, 4), "RIFF");
  assert.equal(readStr(8, 4), "WAVE");
  assert.equal(readStr(12, 4), "fmt ");
  assert.equal(readStr(36, 4), "data");
  assert.equal(view.getUint32(24, true), 44100); // sample rate
  assert.equal(view.getUint16(22, true), 1); // mono
  assert.equal(view.getUint16(34, true), 16); // bits per sample
});

test("encodeWav clamps out-of-range samples instead of wrapping", () => {
  const buf = encodeWav(new Float32Array([2, -2]), 44100);
  const view = new DataView(buf);
  assert.equal(view.getInt16(44, true), 0x7fff);
  assert.equal(view.getInt16(46, true), -0x8000);
});

test("bufferToDataUrl produces a data URL with the correct prefix and decodes back to the same bytes", () => {
  const buf = encodeWav(new Float32Array([0.5, -0.5, 0]), 44100);
  const url = bufferToDataUrl(buf);
  assert.ok(url.startsWith("data:audio/wav;base64,"));
  const base64 = url.slice(url.indexOf(",") + 1);
  const decoded = Buffer.from(base64, "base64");
  assert.deepEqual(new Uint8Array(decoded), new Uint8Array(buf));
});
