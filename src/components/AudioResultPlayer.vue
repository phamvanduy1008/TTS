<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { PauseIcon, PlayIcon } from 'lucide-vue-next';

const props = defineProps({
  audio: {
    type: Blob,
    required: false,
    default: null,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  progress: {
    type: Number,
    default: 0,
  },
  progressLabel: {
    type: String,
    default: '',
  },
  sublabel: {
    type: String,
    default: '',
  },
  playbackRate: {
    type: Number,
    default: 1,
  },
});

const emit = defineEmits(['playing-change', 'playback-rate-change']);

const audioRef = ref(null);
const audioUrl = ref('');
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const playbackRate = ref(props.playbackRate || 1);
const pendingSeekTime = ref(null);
const pendingAutoplay = ref(false);

const progressPercent = computed(() => {
  if (!duration.value) return 0;
  return (currentTime.value / duration.value) * 100;
});

const formattedCurrentTime = computed(() => formatTime(currentTime.value));
const formattedDuration = computed(() => formatTime(duration.value));

function formatTime(timeInSeconds) {
  if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) return '0:00';
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function resetAudioState() {
  currentTime.value = 0;
  duration.value = 0;
  isPlaying.value = false;
  emit('playing-change', false);
}

function togglePlayback() {
  if (props.loading || !props.audio || !audioRef.value) return;
  if (audioRef.value.paused) {
    audioRef.value.play().catch((err) => {
      console.error('Audio playback failed:', err);
    });
    return;
  }
  audioRef.value.pause();
}

function pausePlayback() {
  if (!audioRef.value) return;
  audioRef.value.pause();
}

function seekTo(timeInSeconds = 0) {
  const safeTime = Math.max(0, Number(timeInSeconds) || 0);
  currentTime.value = safeTime;
  if (!audioRef.value) {
    pendingSeekTime.value = safeTime;
    return;
  }
  if (duration.value > 0) {
    audioRef.value.currentTime = Math.min(safeTime, duration.value);
    pendingSeekTime.value = null;
    return;
  }
  pendingSeekTime.value = safeTime;
}

function continueFrom(timeInSeconds = 0, autoplay = false) {
  seekTo(timeInSeconds);
  pendingAutoplay.value = autoplay;
  if (autoplay && audioRef.value && duration.value > 0) {
    audioRef.value.play().catch((err) => {
      console.error('Audio playback failed:', err);
    });
    pendingAutoplay.value = false;
  }
}

function handleLoadedMetadata() {
  if (!audioRef.value) return;
  duration.value = audioRef.value.duration || 0;
  audioRef.value.playbackRate = playbackRate.value;
  if (pendingSeekTime.value !== null) {
    audioRef.value.currentTime = Math.min(pendingSeekTime.value, duration.value || pendingSeekTime.value);
    currentTime.value = audioRef.value.currentTime;
    pendingSeekTime.value = null;
  }
  if (pendingAutoplay.value) {
    audioRef.value.play().catch((err) => {
      console.error('Audio playback failed:', err);
    });
    pendingAutoplay.value = false;
  }
}

function handleTimeUpdate() {
  if (!audioRef.value) return;
  currentTime.value = audioRef.value.currentTime;
  duration.value = audioRef.value.duration || duration.value;
}

function handleSeek(event) {
  const nextTime = Number(event.target.value);
  currentTime.value = nextTime;
  if (!audioRef.value) return;
  audioRef.value.currentTime = nextTime;
}

function handleRateChange(event) {
  const nextRate = Number(event.target.value);
  playbackRate.value = nextRate;
  emit('playback-rate-change', nextRate);
  if (!audioRef.value) return;
  audioRef.value.playbackRate = nextRate;
}

function handlePlay() {
  isPlaying.value = true;
  emit('playing-change', true);
}

function handlePause() {
  isPlaying.value = false;
  emit('playing-change', false);
}

function handleEnded() {
  if (!audioRef.value) return;
  currentTime.value = audioRef.value.duration || duration.value;
  handlePause();
}

watch(
  () => props.audio,
  (blob) => {
    if (audioRef.value) {
      audioRef.value.pause();
    }
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value);
      audioUrl.value = '';
    }
    if (blob) {
      audioUrl.value = URL.createObjectURL(blob);
    }
    pendingSeekTime.value = null;
    pendingAutoplay.value = false;
    resetAudioState();
  },
  { immediate: true }
);

watch(
  () => props.playbackRate,
  (nextRate) => {
    const safeRate = Number(nextRate) || 1;
    playbackRate.value = safeRate;
    if (!audioRef.value) return;
    audioRef.value.playbackRate = safeRate;
  },
  { immediate: true }
);

onUnmounted(() => {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
  }
});

defineExpose({
  togglePlayback,
  pausePlayback,
  seekTo,
  continueFrom,
});
</script>

<template>
  <div class="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-3 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-4 sm:py-4 dark:border-stone-700 dark:bg-stone-900/70">
    <audio
      ref="audioRef"
      :src="audioUrl"
      preload="metadata"
      class="hidden"
      @loadedmetadata="handleLoadedMetadata"
      @timeupdate="handleTimeUpdate"
      @play="handlePlay"
      @pause="handlePause"
      @ended="handleEnded"
    />

    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-900 bg-stone-950 text-amber-100 shadow-[0_8px_18px_rgba(28,25,23,0.16)] transition hover:bg-stone-900 sm:h-11 sm:w-11 dark:border-amber-200 dark:bg-amber-100 dark:text-stone-900 dark:hover:bg-amber-200"
          @click="togglePlayback"
        >
          <PauseIcon v-if="isPlaying" class="h-4 w-4" />
          <PlayIcon v-else class="h-4 w-4" />
        </button>
        <div>
          <p class="mono-ui text-[10px] uppercase tracking-[0.24em] text-stone-400 dark:text-stone-500">Playback</p>
          <p class="text-sm font-medium text-stone-700 dark:text-stone-200">
            {{ formattedCurrentTime }} / {{ formattedDuration }}
          </p>
          <p v-if="loading && sublabel" class="text-xs text-stone-500 dark:text-stone-400">
            {{ sublabel }}
          </p>
        </div>
      </div>

      <div class="w-full rounded-2xl border border-stone-200/80 bg-stone-50/80 px-3 py-3 sm:max-w-[260px] sm:px-4 dark:border-stone-700 dark:bg-stone-900/70">
        <div class="flex w-full items-center gap-3">
          <label for="playback-speed-control" class="mono-ui text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">Speed</label>
          <div class="flex w-full items-center gap-3">
            <input
              id="playback-speed-control"
              type="range"
              :value="playbackRate"
              min="0.5"
              max="2"
              step="0.05"
              class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-stone-200 dark:bg-stone-700 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:shadow-[0_2px_10px_rgba(249,115,22,0.35)]"
              @input="handleRateChange"
            />
            <div class="mono-ui rounded-full border border-stone-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 dark:border-white/10 dark:bg-stone-950 dark:text-stone-100">
              {{ playbackRate }}x
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 space-y-2">
      <div class="flex items-center justify-between gap-2 text-[11px] text-stone-500 sm:text-xs dark:text-stone-400">
        <span>{{ formattedCurrentTime }}</span>
        <span>{{ loading ? (progressLabel || `Generating ${Math.round(progress)}%`) : `${Math.round(progressPercent)}%` }}</span>
        <span>{{ loading ? `${Math.round(progress)}%` : formattedDuration }}</span>
      </div>
      <input
        type="range"
        min="0"
        :max="loading ? 100 : (duration || 0)"
        :value="loading ? progress : currentTime"
        step="0.01"
        :disabled="loading || !audio"
        class="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-stone-200 dark:bg-stone-700 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-teal-500 [&::-webkit-slider-thumb]:shadow-[0_2px_10px_rgba(20,184,166,0.35)]"
        @input="handleSeek"
      />
    </div>
  </div>
</template>
