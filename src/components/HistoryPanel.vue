<script setup>
import { ref, watch } from 'vue';
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  PlayIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-vue-next';
import { formatModelDisplayName } from '../config.js';
import { clearAll, deleteEntry, getEntries } from '../utils/history-store.js';

const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'select']);

const entries = ref([]);
const loading = ref(false);
const clearing = ref(false);
const copyId = ref(null);

async function loadEntries() {
  loading.value = true;
  try {
    entries.value = await getEntries();
  } catch (err) {
    console.error('Failed to load history:', err);
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadEntries();
      return;
    }
  }
);

function previewText(text, maxLen = 44) {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen)}...`;
}

function relativeTime(ts) {
  if (!ts) return 'just now';
  const diffMs = Date.now() - ts;
  const minutes = Math.max(0, Math.floor(diffMs / 60000));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;

  return new Date(ts).toLocaleDateString();
}

function metaLine(entry) {
  const model = formatModelDisplayName(entry?.model || '');
  const speed = entry?.speed ? `${entry.speed}x` : '1x';
  return [model, speed, relativeTime(entry?.createdAt)].filter(Boolean).join(' · ');
}

function charCountLabel(text) {
  return `${(text || '').trim().length} chars`;
}

function selectEntry(entry) {
  if (!entry) return;
  emit('select', entry);
  emit('close');
}

function downloadFilename(entry) {
  const d = new Date(entry.createdAt);
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 8).replace(/:/g, '-');
  return `tts-${date}-${time}.wav`;
}

function downloadAudio(entry) {
  if (!entry?.audio) return;
  const url = URL.createObjectURL(entry.audio);
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadFilename(entry);
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(entry) {
  if (!entry?.text) return;
  try {
    await navigator.clipboard.writeText(entry.text);
    copyId.value = entry.id;
    setTimeout(() => {
      if (copyId.value === entry.id) {
        copyId.value = null;
      }
    }, 1800);
  } catch (err) {
    console.error('Copy failed:', err);
  }
}

async function removeEntry(entry) {
  try {
    await deleteEntry(entry.id);
    entries.value = entries.value.filter((item) => item.id !== entry.id);
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

async function handleClearAll() {
  clearing.value = true;
  try {
    await clearAll();
    entries.value = [];
  } catch (err) {
    console.error('Clear all failed:', err);
  } finally {
    clearing.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="panel">
      <div
        v-if="open"
        class="fixed inset-0 z-[100] flex justify-end"
        role="dialog"
        aria-label="History"
      >
        <div
          class="absolute inset-0 bg-stone-950/25 backdrop-blur-[1px] dark:bg-black/45"
          @click="emit('close')"
        />

        <div
          class="relative flex h-full w-full max-w-xl flex-col border-l border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(249,245,238,0.96))] shadow-[0_24px_80px_rgba(28,25,23,0.18)] dark:border-stone-700 dark:bg-[linear-gradient(180deg,rgba(28,25,23,0.98),rgba(20,18,16,0.98))]"
        >
          <div class="shrink-0 border-b border-stone-200/80 px-5 py-4 dark:border-stone-700">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="mono-ui text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-400 dark:text-stone-500">Recent History</p>
                <h2 class="mt-1 text-lg font-semibold text-stone-800 dark:text-stone-100">Generated audio archive</h2>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-stone-600 transition hover:border-orange-300 hover:text-orange-700 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-300 dark:hover:border-orange-400/40 dark:hover:text-orange-200"
                  :disabled="clearing || entries.length === 0"
                  @click="handleClearAll"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  class="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white/80 text-stone-600 transition hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100"
                  aria-label="Close"
                  @click="emit('close')"
                >
                  <XIcon class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div v-if="loading" class="flex justify-center py-12">
              <div class="h-8 w-8 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
            </div>

            <div
              v-else-if="entries.length === 0"
              class="rounded-[28px] border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-400"
            >
              No history yet. Generate audio once and it will show up here.
            </div>

            <div
              v-else
              class="rounded-[24px] border border-stone-200/80 bg-white/75 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-stone-700 dark:bg-stone-900/60"
            >
              <ul class="divide-y divide-stone-200/80 dark:divide-stone-700">
                <li
                  v-for="entry in entries"
                  :key="entry.id"
                  class="group flex items-start gap-3 px-2 py-3 first:pt-2 last:pb-2 sm:px-3"
                >
                  <button
                    type="button"
                    class="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-500 transition hover:border-orange-300 hover:text-orange-700 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-300 dark:hover:border-orange-400/40 dark:hover:text-orange-200"
                    :title="`Play ${previewText(entry.text, 18)}`"
                    @click="selectEntry(entry)"
                  >
                    <PlayIcon class="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    class="min-w-0 flex-1 text-left"
                    @click="selectEntry(entry)"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
                          {{ previewText(entry.text) }}
                        </p>
                        <p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                          {{ metaLine(entry) }}
                        </p>
                      </div>

                      <span class="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                        {{ charCountLabel(entry.text) }}
                      </span>
                    </div>

                    <div class="mt-2 flex items-center gap-1 opacity-95 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                      <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                        title="Download"
                        @click.stop="downloadAudio(entry)"
                      >
                        <DownloadIcon class="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                        :title="copyId === entry.id ? 'Copied' : 'Copy text'"
                        @click.stop="copyText(entry)"
                      >
                        <CheckIcon v-if="copyId === entry.id" class="h-3.5 w-3.5 text-emerald-500" />
                        <CopyIcon v-else class="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition hover:bg-red-50 hover:text-red-600 dark:text-stone-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                        title="Delete"
                        @click.stop="removeEntry(entry)"
                      >
                        <Trash2Icon class="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
}

.panel-enter-active .relative,
.panel-leave-active .relative {
  transition: transform 0.25s ease;
}

.panel-enter-from .relative,
.panel-leave-to .relative {
  transform: translateX(100%);
}
</style>
