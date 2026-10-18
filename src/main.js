import { TalkingHead } from 'talkinghead';
import { HeadTTS } from 'headtts';
import { EMOTIONS, initEmotions, setEmotion } from './emotions.js';

// TODO: set this to your GLB avatar (must be Ready Player Me / Avaturn-style with Oculus visemes + ARKit blendshapes).
const AVATAR_URL = '/avatars/brunette.glb';
const TEST_PHRASE = 'Hello! I am EmoBuddy. Nice to meet you.';

const statusEl = document.getElementById('status');
const speakBtn = document.getElementById('speak');
const setStatus = (s) => { statusEl.textContent = s; };

// TalkingHead creates and owns the Three.js scene, camera, renderer and render loop inside this node.
const head = new TalkingHead(document.getElementById('avatar'), {
  lipsyncModules: ['en'],
  lipsyncLang: 'en',
  cameraView: 'upper',
  // No cloud TTS: audio and visemes come from HeadTTS via speakAudio().
  ttsEndpoint: null
});

initEmotions(head);

const emotionSel = document.getElementById('emotion');
for (const name of Object.keys(EMOTIONS)) emotionSel.add(new Option(name, name));
emotionSel.addEventListener('change', () => setEmotion(emotionSel.value));

const headtts = new HeadTTS({
  endpoints: ['webgpu', 'wasm'], // in-browser; prepend e.g. 'ws://127.0.0.1:8882' to use `npm run headtts`
  languages: ['en-us'],
  voices: ['af_bella'],
  // Model files are self-hosted in ./models (see `npm run fetch-models`) so huggingface.co isn't needed at runtime.
  transformersModule: new URL('/src/transformers-local.mjs', location.href).href,
  model: 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped',
  voiceURL: new URL('/models/onnx-community/Kokoro-82M-v1.0-ONNX/voices', location.href).href
});

headtts.onmessage = (message) => {
  if (message.type === 'audio') {
    head.speakAudio(message.data, {}, (word) => console.log('word:', word));
  } else if (message.type === 'error') {
    console.error('HeadTTS error:', message.data?.error);
  }
};
headtts.onerror = (e) => { console.error('HeadTTS:', e); setStatus('TTS error: ' + (e?.message || e)); speakBtn.disabled = true; };

/** Make the avatar speak `text` with lip-sync. */
export function speak(text = TEST_PHRASE) {
  head.audioCtx?.resume?.(); // browsers require a user gesture before audio
  headtts.synthesize({ input: text });
}

async function init() {
  setStatus('Loading avatar…');
  await head.showAvatar(
    { url: AVATAR_URL, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en' },
    (ev) => { if (ev.lengthComputable) setStatus(`Loading avatar… ${Math.round(ev.loaded / ev.total * 100)}%`); }
  );
  setStatus('Loading TTS (first load downloads the model)…');
  await headtts.connect();
  headtts.setup({ voice: 'af_bella', language: 'en-us', speed: 1, audioEncoding: 'wav' });
  setStatus('Ready');
  speakBtn.disabled = false;
}

speakBtn.addEventListener('click', () => speak());
init().catch((e) => { console.error(e); setStatus('Error: ' + e.message); });
