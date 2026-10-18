// Loaded by the HeadTTS worker in place of the stock transformers.js URL.
// Makes transformers.js read the Kokoro model from ./models instead of huggingface.co.
import { env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0/dist/transformers.min.js';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = new URL('/models/', self.location.href).href;

export * from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0/dist/transformers.min.js';
