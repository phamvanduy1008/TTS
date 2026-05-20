import { PiperTTS, TextSplitterStream } from "../lib/piper-tts.js";
import { getVietnameseModelAssetCandidates } from "../config.js";

let tts = null;

// Initialize the model
async function initializeModel(modelName = null) {
  try {
    // Default to the original model if no model name provided
    const defaultModel = 'en_US-libritts_r-medium';
    const model = modelName || defaultModel;
    const { modelPaths, configPaths } = getVietnameseModelAssetCandidates(model);

    let lastError = null;
    const attemptedSources = [];
    for (let i = 0; i < modelPaths.length; i++) {
      try {
        attemptedSources.push({
          model: modelPaths[i],
          config: configPaths[i],
        });
        tts = await PiperTTS.from_pretrained(modelPaths[i], configPaths[i]);
        break;
      } catch (error) {
        lastError = error;
        tts = null;
      }
    }

    if (!tts) {
      const attempted = attemptedSources
        .map(({ model, config }) => `model=${model}, config=${config}`)
        .join(' | ');
      const reason = lastError?.message || 'Unknown error';
      throw new Error(`Unable to load model "${model}". Tried: ${attempted}. Last error: ${reason}`);
    }
    
    // Get available speakers
    const speakers = tts.getSpeakers();
    
    self.postMessage({ status: "ready", voices: speakers });
  } catch (e) {
    console.error("Error loading model:", e);
    self.postMessage({ status: "error", data: e.message });
  }
}

// Handle voice preview
async function handlePreview(text, voice, speed) {
  try {
    const streamer = new TextSplitterStream();
    await streamer.push(text);
    streamer.close();

    const speakerId = typeof voice === 'number' ? voice : parseInt(voice) || 0;
    const lengthScale = 1.0 / (speed || 1.0);
    
    const stream = tts.stream(streamer, { 
      speakerId, 
      lengthScale
    });

    // Get just the first chunk for preview
    for await (const { audio } of stream) {
      // Create and play preview audio
      const audioBlob = audio.toBlob();
      self.postMessage({ status: "preview", audio: audioBlob });
      break; // Only preview the first chunk
    }
  } catch (error) {
    console.error('Error generating preview:', error);
  }
}

// Listen for messages from the main thread
self.addEventListener("message", async (e) => {
  const { type, text, voice, speed, model } = e.data;
  
  // Handle initialization
  if (type === 'init') {
    await initializeModel(model);
    return;
  }
  
  // Handle TTS generation
  if (!tts) {
    self.postMessage({ status: "error", data: "Model not initialized" });
    return;
  }
  
  // Handle voice preview
  if (type === 'preview') {
    await handlePreview(text, voice, speed);
    return;
  }
  
  const streamer = new TextSplitterStream();

  await streamer.push(text);
  streamer.close(); // Indicate we won't add more text
  const streamChunks = streamer.chunks || [];
  const totalChunks = streamChunks.length || 1;
  const totalChars = streamChunks.reduce((sum, chunk) => sum + chunk.length, 0) || text.length || 1;

  // Convert voice from voice ID to speaker ID
  const speakerId = typeof voice === 'number' ? voice : parseInt(voice) || 0;
  
  // console.log('🎤 Worker received voice ID:', voice);
  // console.log('🎤 Worker converted to speaker ID:', speakerId);
  
  // Convert speed to lengthScale (inverse relationship: higher speed = lower lengthScale)
  const lengthScale = 1.0 / (speed || 1.0);
  
  const stream = tts.stream(streamer, { 
    speakerId, 
    lengthScale
  });
  const chunks = [];

  try {
    let completedChunks = 0;
    let completedChars = 0;
    for await (const { text, audio } of stream) {
      completedChunks += 1;
      completedChars += text?.length || 0;
      self.postMessage({
        status: "stream",
        chunk: {
          audio: audio.toBlob(),
          text,
        },
      });
      self.postMessage({
        status: "progress",
        completedChunks,
        totalChunks,
        completedChars,
        totalChars,
        progress: Math.round((completedChars / totalChars) * 100),
        chunkText: text,
      });
      chunks.push(audio);
    }
  } catch (error) {
    console.error("Error during streaming:", error);
    self.postMessage({ status: "error", data: error.message });
    return;
  }

  // Merge chunks
  let audio;
  if (chunks.length > 0) {
    try {
      self.postMessage({ status: "finalizing" });
      const originalSamplingRate = chunks[0].sampling_rate;
      const length = chunks.reduce((sum, chunk) => sum + chunk.audio.length, 0);
      let waveform = new Float32Array(length);
      let offset = 0;
      for (const { audio } of chunks) {
        waveform.set(audio, offset);
        offset += audio.length;
      }

      // Normalize peaks & trim silence
      normalizePeak(waveform, 1.0);

      // Create a new merged RawAudio with the original sample rate
      // @ts-expect-error - So that we don't need to import RawAudio
      audio = new chunks[0].constructor(waveform, originalSamplingRate);
    } catch (error) {
      console.error("Error processing audio chunks:", error);
      self.postMessage({ status: "error", data: error.message });
      return;
    }
  }

  self.postMessage({ status: "complete", audio: audio?.toBlob() });
});

function normalizePeak(f32, target = 0.9) {
  if (!f32?.length) return;
  let max = 1e-9;
  for (let i = 0; i < f32.length; i++) max = Math.max(max, Math.abs(f32[i]));
  const g = Math.min(4, target / max);
  if (g < 1) {
    for (let i = 0; i < f32.length; i++) f32[i] *= g;
  }
}

// Note: Initialization now handled via init message from UI
