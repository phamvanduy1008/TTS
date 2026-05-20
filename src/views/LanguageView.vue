<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import {
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  CopyIcon,
  CheckIcon,
  XIcon,
} from 'lucide-vue-next';
import TextStatistics from '../components/TextStatistics.vue';
import AudioChunk from '../components/AudioChunk.vue';
import AudioResultPlayer from '../components/AudioResultPlayer.vue';
import ModelSelector from '../components/ModelSelector.vue';
import VoiceSelector from '../components/VoiceSelector.vue';
import { getModelsListUrl, DEFAULT_LANG_MODELS, DEFAULT_MODEL, REMOTE_LANG_MODELS_FALLBACK } from '../config.js';
import { addEntry } from '../utils/history-store.js';

const props = defineProps({
  lang: {
    type: String,
    required: true,
  },
});

const defaultText = {
  en: "The quick brown fox jumps over the lazy dog.",
  id: "Halo, selamat datang di dunia kecerdasan buatan.",
};

const text = ref(defaultText[props.lang] || defaultText.en);
const lastGeneration = ref(null);
const isPlaying = ref(false);
const currentChunkIndex = ref(-1);
const playbackSpeed = ref(1);
const copied = ref(false);
const status = ref("idle");
const error = ref(null);
const worker = ref(null);
const voices = ref(null);
const selectedVoice = ref(0);
const chunks = ref([]);
const result = ref(null);
const resultPlayer = ref(null);
const resultPlaying = ref(false);
const generationProgress = ref(0);
const generationProgressLabel = ref('');
const generationSubLabel = ref('');
const generationStartedAt = ref(0);
const chunkDurations = ref([]);
const livePlaybackTime = ref(0);
const shouldResumeResultPlayback = ref(false);
const generationSession = ref(0);
const availableModels = ref([]);
const selectedModel = ref("None");
const modelsLoading = ref(false);
const loadingProgress = ref(0);

const getRemoteFallbackModels = (lang) => REMOTE_LANG_MODELS_FALLBACK[lang] || [];

const processed = computed(() => {
  return lastGeneration.value &&
      lastGeneration.value.text === text.value &&
      lastGeneration.value.voice === selectedVoice.value &&
      lastGeneration.value.model === selectedModel.value;
});

const isPrimaryPlaying = computed(() => isPlaying.value || resultPlaying.value);
const isGenerating = computed(() => status.value === 'generating' || status.value === 'finalizing');
const canGenerate = computed(() => !isGenerating.value && !!text.value.trim());
const showPlayButton = computed(() => (isGenerating.value && chunks.value.length > 0) || (!!result.value && processed.value));
const playLabel = computed(() => {
  if (isPrimaryPlaying.value) return 'Pause';
  if (isGenerating.value) return 'Play Live';
  return 'Play';
});

const setPlaybackSpeed = (newSpeed) => {
  playbackSpeed.value = newSpeed;
};

const setSelectedVoice = (voice) => {
  selectedVoice.value = voice;
};

const handleVoicePreview = (voiceId) => {
  if (!worker.value || status.value !== "ready") return;
  worker.value.postMessage({
    type: 'preview',
    text: props.lang === 'en' ? "Hello, this is a voice preview." : "Halo, ini adalah pratinjau suara.",
    voice: voiceId,
    speed: 1
  });
};

const restartWorker = (modelName = null) => {
  if (worker.value) {
    worker.value.terminate();
  }

  status.value = "loading";
  loadingProgress.value = 0;
  voices.value = null;
  chunks.value = [];
  result.value = null;
  generationProgress.value = 0;
  generationProgressLabel.value = '';
  generationSubLabel.value = '';
  generationStartedAt.value = 0;
  chunkDurations.value = [];
  livePlaybackTime.value = 0;
  shouldResumeResultPlayback.value = false;
  lastGeneration.value = null;
  isPlaying.value = false;
  currentChunkIndex.value = -1;

  const progressInterval = setInterval(() => {
    if (loadingProgress.value < 90) {
      loadingProgress.value += Math.random() * 5;
      if (loadingProgress.value > 90) loadingProgress.value = 90;
    }
  }, 200);

  worker.value = new Worker(new URL("../workers/tts-worker-i18n.js", import.meta.url), {
    type: "module",
  });

  worker.value.addEventListener("message", onMessageReceived);
  worker.value.addEventListener("error", onErrorReceived);

  const modelToLoad = modelName || selectedModel.value;
  worker.value.postMessage({ type: 'init', lang: props.lang, model: modelToLoad });
  worker.value._progressInterval = progressInterval;
};

const setCurrentChunkIndex = (index) => {
  currentChunkIndex.value = index;
};

const setIsPlaying = (playing) => {
  isPlaying.value = playing;
};

const handleChunkEnd = () => {
  const endedIndex = currentChunkIndex.value;
  livePlaybackTime.value = getLivePlaybackOffset(endedIndex, chunkDurations.value[endedIndex] || 0);
  if (status.value !== "generating" && currentChunkIndex.value === chunks.value.length - 1) {
    isPlaying.value = false;
    currentChunkIndex.value = -1;
  } else {
    currentChunkIndex.value = currentChunkIndex.value + 1;
  }
};

const handleChunkTimeUpdate = (index, currentTime) => {
  livePlaybackTime.value = getLivePlaybackOffset(index, currentTime);
};

const handleChunkLoadedMetadata = (index, duration) => {
  chunkDurations.value[index] = duration;
};

const getLivePlaybackOffset = (index, currentTime = 0) => {
  if (index < 0) return Math.max(0, currentTime);
  const previousDuration = chunkDurations.value
    .slice(0, index)
    .reduce((sum, value) => sum + (value || 0), 0);
  return previousDuration + Math.max(0, currentTime);
};

const handleGenerate = () => {
  if (!canGenerate.value) return;
  resultPlayer.value?.pausePlayback();
  resultPlaying.value = false;
  isPlaying.value = false;
  status.value = "generating";
  chunks.value = [];
  result.value = null;
  chunkDurations.value = [];
  currentChunkIndex.value = -1;
  generationProgress.value = 0;
  generationProgressLabel.value = 'Preparing text...';
  generationSubLabel.value = '';
  generationStartedAt.value = Date.now();
  livePlaybackTime.value = 0;
  shouldResumeResultPlayback.value = false;
  generationSession.value += 1;
  lastGeneration.value = {
    text: text.value,
    voice: selectedVoice.value,
    speed: 1,
    model: selectedModel.value
  };
  worker.value?.postMessage({
    text: text.value,
    voice: selectedVoice.value,
    speed: 1
  });
};

const handlePlayPause = () => {
  if (isGenerating.value) {
    if (chunks.value.length === 0 && !isPlaying.value) return;
    if (currentChunkIndex.value === -1) {
      currentChunkIndex.value = 0;
    }
    shouldResumeResultPlayback.value = !isPlaying.value;
    isPlaying.value = !isPlaying.value;
    return;
  }

  if (processed.value && result.value) {
    resultPlayer.value?.togglePlayback();
  }
};

const handleCancelGeneration = () => {
  if (!isGenerating.value) return;
  if (worker.value) {
    worker.value.terminate();
    worker.value = null;
  }
  chunks.value = [];
  chunkDurations.value = [];
  result.value = null;
  generationProgress.value = 0;
  generationProgressLabel.value = '';
  generationSubLabel.value = '';
  isPlaying.value = false;
  resultPlaying.value = false;
  currentChunkIndex.value = -1;
  livePlaybackTime.value = 0;
  shouldResumeResultPlayback.value = false;
  status.value = 'loading';
  restartWorker(selectedModel.value);
};

const handleResultPlayingChange = (playing) => {
  resultPlaying.value = playing;
  if (playing && isPlaying.value) {
    isPlaying.value = false;
    currentChunkIndex.value = -1;
  }
};

const resetPlaybackToGenerate = () => {
  if (status.value === 'generating' || status.value === 'finalizing') return;
  if (!lastGeneration.value) return;

  const inputChanged =
    lastGeneration.value.text !== text.value ||
    lastGeneration.value.voice !== selectedVoice.value ||
    lastGeneration.value.model !== selectedModel.value;

  if (!inputChanged) return;

  resultPlayer.value?.pausePlayback();
  isPlaying.value = false;
  resultPlaying.value = false;
  currentChunkIndex.value = -1;
};

const downloadAudio = () => {
  if (!result.value) return;
  const url = URL.createObjectURL(result.value);
  const link = document.createElement("a");
  link.href = url;
  link.download = "audio.wav";
  link.click();
  URL.revokeObjectURL(url);
};

const handleCopy = async () => {
  await navigator.clipboard.writeText(text.value);
  copied.value = true;
  setTimeout(() => { copied.value = false }, 2000);
};

const fetchModels = async () => {
  modelsLoading.value = true;
  error.value = null;
  try {
    const url = getModelsListUrl(props.lang);
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const list = data.models || [];
      availableModels.value = list.length > 0 ? list : (getRemoteFallbackModels(props.lang).length > 0 ? getRemoteFallbackModels(props.lang) : (DEFAULT_LANG_MODELS[props.lang] || []));
    } else {
      availableModels.value = getRemoteFallbackModels(props.lang).length > 0 ? getRemoteFallbackModels(props.lang) : (DEFAULT_LANG_MODELS[props.lang] || []);
    }
    if (selectedModel.value && selectedModel.value !== "None" && !availableModels.value.includes(selectedModel.value)) {
      selectedModel.value = "None";
    }

    // Auto-load default model when entering page
    const models = availableModels.value;
    if (selectedModel.value === "None" && models.length > 0) {
      const defaultModel = (DEFAULT_MODEL[props.lang] && models.includes(DEFAULT_MODEL[props.lang]))
        ? DEFAULT_MODEL[props.lang]
        : models[0];
      selectedModel.value = defaultModel;
      restartWorker(defaultModel);
    }
  } catch (err) {
    console.error('Failed to fetch models:', err);
    availableModels.value = getRemoteFallbackModels(props.lang).length > 0 ? getRemoteFallbackModels(props.lang) : (DEFAULT_LANG_MODELS[props.lang] || []);
  } finally {
    modelsLoading.value = false;
  }
};

const handleModelChange = (modelName) => {
  if (modelName !== selectedModel.value) {
    selectedModel.value = modelName;

    if (modelName === "None") {
      if (worker.value) {
        worker.value.terminate();
        worker.value = null;
      }
      status.value = "idle";
      voices.value = null;
      chunks.value = [];
      result.value = null;
      generationProgress.value = 0;
      generationProgressLabel.value = '';
      generationSubLabel.value = '';
      generationStartedAt.value = 0;
      chunkDurations.value = [];
      livePlaybackTime.value = 0;
      shouldResumeResultPlayback.value = false;
      lastGeneration.value = null;
      isPlaying.value = false;
      currentChunkIndex.value = -1;
    } else {
      restartWorker(modelName);
    }
  }
};

const onMessageReceived = ({ data }) => {
  switch (data.status) {
    case "ready":
      if (worker.value?._progressInterval) {
        clearInterval(worker.value._progressInterval);
      }
      loadingProgress.value = 100;
      setTimeout(() => {
        status.value = "ready";
        loadingProgress.value = 0;
      }, 300);
      voices.value = data.voices;
      break;
    case "error":
      if (worker.value?._progressInterval) {
        clearInterval(worker.value._progressInterval);
      }
      loadingProgress.value = 0;
      status.value = "error";
      generationProgress.value = 0;
      generationProgressLabel.value = '';
      generationSubLabel.value = '';
      chunkDurations.value = [];
      livePlaybackTime.value = 0;
      shouldResumeResultPlayback.value = false;
      error.value = data.data;
      break;
    case "stream":
      chunks.value = [...chunks.value, data.chunk];
      break;
    case "progress":
      generationProgress.value = data.progress || 0;
      generationProgressLabel.value = `Generated ${data.completedChunks}/${data.totalChunks} segments`;
      if (generationStartedAt.value && data.progress > 0) {
        const elapsedMs = Date.now() - generationStartedAt.value;
        const estimatedTotalMs = elapsedMs / (data.progress / 100);
        const remainingSec = Math.max(0, Math.round((estimatedTotalMs - elapsedMs) / 1000));
        generationSubLabel.value = `Processed ${data.completedChars}/${data.totalChars} chars, ~${remainingSec}s left`;
      } else {
        generationSubLabel.value = `Processed ${data.completedChars}/${data.totalChars} chars`;
      }
      break;
    case "finalizing":
      status.value = "finalizing";
      generationProgressLabel.value = 'Finalizing audio file...';
      generationSubLabel.value = 'Merging segments into one downloadable file';
      break;
    case "complete":
      status.value = "ready";
      generationProgress.value = 100;
      generationProgressLabel.value = 'Audio ready';
      generationSubLabel.value = '';
      generationStartedAt.value = 0;
      result.value = data.audio;
      nextTick(() => {
        if (!resultPlayer.value) return;
        if (shouldResumeResultPlayback.value) {
          isPlaying.value = false;
          currentChunkIndex.value = -1;
        }
        resultPlayer.value.continueFrom(livePlaybackTime.value, shouldResumeResultPlayback.value);
        shouldResumeResultPlayback.value = false;
      });
      if (data.audio && lastGeneration.value && selectedModel.value) {
        addEntry({
          text: lastGeneration.value.text,
          voice: lastGeneration.value.voice,
          speed: 1,
          model: selectedModel.value,
          lang: props.lang,
          audio: data.audio,
        }).catch((err) => console.error('History save failed:', err));
      }
      break;
    case "preview":
      if (data.audio) {
        const audioUrl = URL.createObjectURL(data.audio);
        const audio = new Audio(audioUrl);
        audio.play().then(() => {
          setTimeout(() => URL.revokeObjectURL(audioUrl), 1000);
        }).catch(err => console.error('Error playing preview:', err));
      }
      break;
  }
};

const onErrorReceived = (e) => {
  console.error("Worker error:", e);
  error.value = e.message;
};

watch(() => props.lang, () => {
  text.value = defaultText[props.lang] || defaultText.en;
  selectedModel.value = "None";
  availableModels.value = [];
  if (worker.value) {
    worker.value.terminate();
    worker.value = null;
  }
  status.value = "idle";
  voices.value = null;
  chunks.value = [];
  result.value = null;
  generationProgress.value = 0;
  generationProgressLabel.value = '';
  generationSubLabel.value = '';
  generationStartedAt.value = 0;
  chunkDurations.value = [];
  livePlaybackTime.value = 0;
  shouldResumeResultPlayback.value = false;
  lastGeneration.value = null;
  isPlaying.value = false;
  currentChunkIndex.value = -1;
  fetchModels();
}, { immediate: false });

onMounted(async () => {
  await fetchModels();
});

watch([text, selectedVoice, selectedModel], resetPlaybackToGenerate);

onUnmounted(() => {
  if (worker.value) {
    worker.value.terminate();
  }
});
</script>

<template>
  <div>
    <div class="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden">
      <div class="p-6 pb-0 space-y-6">
        <div class="space-y-4">
          <div class="relative">
            <textarea
              v-model="text"
              placeholder="Type or paste your text here..."
              class="w-full min-h-[180px] text-lg leading-relaxed resize-y p-4 pt-8 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-purple-500 dark:focus:border-purple-400 focus:ring-0 transition-colors"
              :class="voices ? '' : 'text-muted-foreground'"
            ></textarea>
            <button
              class="absolute top-1 right-3 h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
              @click="handleCopy"
              :title="copied ? 'Copied!' : 'Copy text'"
            >
              <CheckIcon v-if="copied" class="h-4 w-4 text-green-500" />
              <CopyIcon v-else class="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div class="flex justify-end">
            <TextStatistics :text="text" />
          </div>
        </div>

        <div class="space-y-4">
          <div v-if="availableModels.length > 0" class="flex items-center">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Model:</label>
            <ModelSelector
              :models="availableModels"
              :selected-model="selectedModel"
              @model-change="handleModelChange"
            />
          </div>

          <div v-if="modelsLoading" class="flex items-center gap-2 text-muted-foreground text-sm">
            <div class="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
            <span>Loading available models...</span>
          </div>

          <div v-if="voices" class="grid grid-cols-1 gap-4">
            <div v-if="voices" class="flex items-center">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Voice:</label>
              <VoiceSelector
                :voices="voices"
                :selected-voice="selectedVoice"
                @voice-change="setSelectedVoice"
                @voice-preview="handleVoicePreview"
              />
            </div>
          </div>

          <div v-else-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {{ error }}
          </div>
          <div v-else-if="selectedModel === 'None' && availableModels.length > 0" class="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm">
            Please select a model to start using TTS
          </div>
          <div v-else-if="availableModels.length === 0 && !modelsLoading" class="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg text-sm">
            No models available for this language. Add model files to <code class="text-xs">public/tts-model/{{ lang }}/</code> for local dev, or configure the API for production.
          </div>
          <div v-else-if="!voices && status === 'loading'" class="w-full flex items-center gap-3">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Loading model</span>
            <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 ease-out flex items-center justify-end pr-2"
                :style="{ width: `${loadingProgress}%` }"
              >
                <span class="text-white text-xs font-semibold">{{ Math.round(loadingProgress) }}%</span>
              </div>
            </div>
          </div>

          <AudioResultPlayer
            v-if="result || status === 'generating' || status === 'finalizing'"
            :key="generationSession"
            ref="resultPlayer"
            :audio="result"
            :loading="isGenerating && !result"
            :progress="generationProgress"
            :progress-label="generationProgressLabel"
            :sublabel="generationSubLabel"
            :playback-rate="playbackSpeed"
            @playing-change="handleResultPlayingChange"
            @playback-rate-change="setPlaybackSpeed"
          />
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <button
            class="flex min-w-[144px] items-center justify-center gap-2 rounded-[18px] border border-stone-900 bg-stone-950 px-7 py-4 font-semibold text-amber-100 shadow-[0_8px_18px_rgba(28,25,23,0.16)] transition hover:bg-stone-900 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-200 dark:bg-amber-100 dark:text-stone-900 dark:hover:bg-amber-200"
            @click="handleGenerate"
            :disabled="!canGenerate"
          >
            <PlayIcon class="w-5 h-5" />
            <span>Generate</span>
          </button>

          <button
            v-if="showPlayButton"
            class="flex min-w-[144px] items-center justify-center gap-2 rounded-[18px] border border-stone-900 bg-stone-950 px-7 py-4 font-semibold text-amber-100 shadow-[0_8px_18px_rgba(28,25,23,0.16)] transition hover:bg-stone-900 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-200 dark:bg-amber-100 dark:text-stone-900 dark:hover:bg-amber-200"
            @click="handlePlayPause"
          >
            <PauseIcon v-if="isPrimaryPlaying" class="w-5 h-5" />
            <PlayIcon v-else class="w-5 h-5" />
            <span>{{ playLabel }}</span>
          </button>

          <button
            class="flex min-w-[200px] items-center justify-center gap-2 rounded-[18px] border border-stone-300 bg-white px-7 py-4 font-semibold text-stone-600 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition hover:border-stone-900 hover:bg-stone-50 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-amber-100 dark:hover:border-amber-200 dark:hover:bg-stone-950 dark:hover:text-amber-50"
            @click="downloadAudio"
            :disabled="!result || status !== 'ready'"
          >
            <DownloadIcon class="w-4 h-4" />
            Download Audio
          </button>

          <button
            v-if="isGenerating"
            class="flex min-w-[144px] items-center justify-center gap-2 rounded-[18px] border border-red-200 bg-red-50 px-7 py-4 font-semibold text-red-700 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition hover:border-red-300 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
            @click="handleCancelGeneration"
          >
            <XIcon class="w-4 h-4" />
            Cancel
          </button>
        </div>

        <div class="w-0 h-0 hidden">
          <AudioChunk
            v-if="chunks.length > 0"
            v-for="(chunk, index) in chunks"
            :key="index"
            :audio="chunk.audio"
            :active="currentChunkIndex === index"
            :playing="isPlaying"
            :playback-rate="playbackSpeed"
            class="hidden"
            @start="() => setCurrentChunkIndex(index)"
            @pause="() => { if (currentChunkIndex === index) setIsPlaying(false) }"
            @time-update="(time) => handleChunkTimeUpdate(index, time)"
            @loaded-metadata="(duration) => handleChunkLoadedMetadata(index, duration)"
            @end="handleChunkEnd"
          />
        </div>
      </div>
    </div>
  </div>
</template>
