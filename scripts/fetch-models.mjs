// Downloads the Kokoro model + voices into ./models for offline/self-hosted HeadTTS.
// Run on a network that can reach huggingface.co (or set HF_HOST to a reachable mirror):
//   npm run fetch-models              # q4 (wasm) + fp32 (webgpu) weights, voice af_bella
//   npm run fetch-models -- q4        # only the q4 weights
//   VOICES=af_bella,am_fenrir npm run fetch-models
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

const HOST = process.env.HF_HOST || 'https://huggingface.co';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped';
const VOICE_REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const dtypes = process.argv.slice(2).length ? process.argv.slice(2) : ['q4', 'fp32'];
const voices = (process.env.VOICES || 'af_bella').split(',');
const root = new URL('../models/', import.meta.url).pathname;

const onnxName = (d) => (d === 'fp32' ? 'onnx/model.onnx' : `onnx/model_${d === 'q8' ? 'quantized' : d}.onnx`);
const files = [
  ...['config.json', 'tokenizer.json', 'tokenizer_config.json', 'generation_config.json', 'preprocessor_config.json']
    .map((f) => [MODEL, f, true]),
  ...dtypes.map((d) => [MODEL, onnxName(d), false]),
  ...voices.map((v) => [VOICE_REPO, `voices/${v}.bin`, false])
];

for (const [repo, path, optional] of files) {
  const dest = join(root, repo, path);
  if (await stat(dest).then((s) => s.size > 0, () => false)) { console.log('have', path); continue; }
  const res = await fetch(`${HOST}/${repo}/resolve/main/${path}`);
  if (!res.ok) {
    if (optional && res.status === 404) { console.log('skip (not in repo)', path); continue; }
    throw new Error(`${res.status} ${res.statusText}: ${repo}/${path}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  console.log('get ', repo + '/' + path, `${Math.round(Number(res.headers.get('content-length') || 0) / 1e6)} MB`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}
console.log('Done. Model files are in ./models');
