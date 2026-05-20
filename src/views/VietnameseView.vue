<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
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
import DemoTable from '../components/DemoTable.vue';
import { fetchAvailableModels } from '../utils/model-detector.js';
import { addEntry } from '../utils/history-store.js';
import { DEFAULT_MODEL } from '../config.js';

const text = ref(
"Xin chào! Đây là một ví dụ về văn bản tiếng Việt để kiểm tra chức năng chuyển văn bản thành giọng nói.");
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

  worker.value = new Worker(new URL("../workers/tts-worker.js", import.meta.url), {
    type: "module",
  });

  worker.value.addEventListener("message", onMessageReceived);
  worker.value.addEventListener("error", onErrorReceived);

  const modelToLoad = modelName || selectedModel.value;
  worker.value.postMessage({ type: 'init', model: modelToLoad });
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
  const params = {
    text: text.value,
    voice: selectedVoice.value,
    speed: 1,
    model: selectedModel.value
  };
  lastGeneration.value = params;
  worker.value?.postMessage(params);
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

const handleDemoTextClick = (demoText) => {
  text.value = demoText;
};

const fetchModels = async () => {
  modelsLoading.value = true;
  try {
    const models = await fetchAvailableModels();
    availableModels.value = models;

    if (selectedModel.value && selectedModel.value !== "None" && !models.includes(selectedModel.value)) {
      selectedModel.value = "None";
      if (worker.value) {
        worker.value.terminate();
        worker.value = null;
        status.value = "loading";
        voices.value = null;
        generationProgress.value = 0;
        generationProgressLabel.value = '';
        chunkDurations.value = [];
        livePlaybackTime.value = 0;
        shouldResumeResultPlayback.value = false;
      }
    }

    if (selectedModel.value === "None" && models.length > 0) {
      const preferredVietnameseModel = models.includes('ngochuyen')
        ? 'ngochuyen'
        : null;
      const configuredDefaultModel = (DEFAULT_MODEL.vi && models.includes(DEFAULT_MODEL.vi))
        ? DEFAULT_MODEL.vi
        : models[0];
      const defaultModel = preferredVietnameseModel || configuredDefaultModel;
      selectedModel.value = defaultModel;
      restartWorker(defaultModel);
    }
  } catch (err) {
    console.error('Failed to fetch models:', err);
    error.value = `Failed to load models: ${err.message}`;
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
      status.value = "loading";
      voices.value = null;
      chunks.value = [];
      chunkDurations.value = [];
      result.value = null;
      generationProgress.value = 0;
      generationProgressLabel.value = '';
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
          lang: 'vi',
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
  <div class="space-y-6">
    <section class="studio-panel p-4 sm:p-6">
      <div class="space-y-6">
        <div class="relative">
          <textarea
            v-model="text"
            placeholder="Enter or paste text here..."
            class="min-h-[180px] w-full resize-y rounded-[24px] border border-stone-200/80 bg-white px-4 pb-4 pt-8 text-base leading-7 text-stone-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(15,23,42,0.04)] transition placeholder:text-stone-400 focus:border-orange-300 focus:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] focus:outline-none sm:min-h-[200px] sm:px-6 sm:pb-6 sm:pt-9 sm:text-[1.08rem] sm:leading-8 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
          ></textarea>
          <button
            class="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-transparent bg-white/70 text-stone-500 transition hover:border-stone-200 hover:bg-white hover:text-stone-800 sm:right-4 sm:top-4 sm:h-10 sm:w-10 dark:bg-stone-900/70 dark:text-stone-300 dark:hover:border-stone-700 dark:hover:bg-stone-900 dark:hover:text-stone-100"
            @click="handleCopy"
            :title="copied ? 'Copied!' : 'Copy text'"
          >
            <CheckIcon v-if="copied" class="h-4 w-4" />
            <CopyIcon v-else class="h-4 w-4" />
          </button>
        </div>

        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex flex-wrap items-center gap-2">
            <TextStatistics :text="text" />
          </div>

          <div v-if="availableModels.length > 0" class="w-full xl:w-auto xl:min-w-[320px]">
            <div class="rounded-2xl border border-stone-200/80 bg-stone-50/80 p-1 dark:border-stone-700 dark:bg-stone-900/70">
              <ModelSelector
                :models="availableModels"
                :selected-model="selectedModel"
                @model-change="handleModelChange"
              />
            </div>
          </div>
        </div>

        <div v-if="modelsLoading" class="rounded-2xl border border-amber-200/70 bg-amber-50/90 px-4 py-3.5 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          Dang quet danh sach model...
        </div>

        <div v-else-if="error" class="rounded-2xl border border-red-200/70 bg-red-50/90 px-4 py-3.5 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          {{ error }}
        </div>

        <div v-else-if="selectedModel === 'None'" class="rounded-2xl border border-amber-200/70 bg-amber-50/90 px-4 py-3.5 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          No models available for this language. Add model files to <span class="mono-ui">public/tts-model/vi/</span> for local dev, or configure the API for production.
        </div>

        <div v-else-if="!voices && status === 'loading'" class="space-y-3 rounded-2xl border border-stone-200/80 bg-stone-100/90 px-4 py-4 dark:border-stone-700 dark:bg-stone-800">
          <div class="flex items-center justify-between text-sm text-stone-600 dark:text-stone-300">
            <span>Loading model</span>
            <span class="mono-ui">{{ Math.round(loadingProgress) }}%</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
            <div
              class="h-full rounded-full bg-gradient-to-r from-orange-400 via-amber-300 to-teal-400 transition-all duration-300 ease-out"
              :style="{ width: `${loadingProgress}%` }"
            ></div>
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

        <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            class="flex w-full items-center justify-center gap-2 rounded-[18px] border border-stone-900 bg-stone-950 px-6 py-3.5 font-semibold text-amber-100 shadow-[0_8px_18px_rgba(28,25,23,0.16)] transition hover:bg-stone-900 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[144px] sm:w-auto sm:px-7 sm:py-4 dark:border-amber-200 dark:bg-amber-100 dark:text-stone-900 dark:hover:bg-amber-200"
            @click="handleGenerate"
            :disabled="!canGenerate"
          >
            <PlayIcon class="h-5 w-5" />
            <span>Generate</span>
          </button>

          <button
            v-if="showPlayButton"
            class="flex w-full items-center justify-center gap-2 rounded-[18px] border border-stone-900 bg-stone-950 px-6 py-3.5 font-semibold text-amber-100 shadow-[0_8px_18px_rgba(28,25,23,0.16)] transition hover:bg-stone-900 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[144px] sm:w-auto sm:px-7 sm:py-4 dark:border-amber-200 dark:bg-amber-100 dark:text-stone-900 dark:hover:bg-amber-200"
            @click="handlePlayPause"
          >
            <PauseIcon v-if="isPrimaryPlaying" class="h-5 w-5" />
            <PlayIcon v-else class="h-5 w-5" />
            <span>{{ playLabel }}</span>
          </button>

          <button
            class="flex w-full items-center justify-center gap-2 rounded-[18px] border border-stone-300 bg-white px-6 py-3.5 font-semibold text-stone-600 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition hover:border-stone-900 hover:bg-stone-50 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[200px] sm:w-auto sm:px-7 sm:py-4 dark:border-stone-700 dark:bg-stone-900 dark:text-amber-100 dark:hover:border-amber-200 dark:hover:bg-stone-950 dark:hover:text-amber-50"
            @click="downloadAudio"
            :disabled="!result || status !== 'ready'"
          >
            <DownloadIcon class="h-4 w-4" />
            <span>Download Audio</span>
          </button>

          <button
            v-if="isGenerating"
            class="flex w-full items-center justify-center gap-2 rounded-[18px] border border-red-200 bg-red-50 px-6 py-3.5 font-semibold text-red-700 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition hover:border-red-300 hover:bg-red-100 sm:min-w-[144px] sm:w-auto sm:px-7 sm:py-4 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
            @click="handleCancelGeneration"
          >
            <XIcon class="h-4 w-4" />
            <span>Cancel</span>
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
    </section>

    <DemoTable @text-click="handleDemoTextClick" />
  </div>
</template>
