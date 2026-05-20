<script setup>
import { ref } from 'vue';
import { RouterView } from 'vue-router';
import ThemeToggle from './components/ThemeToggle.vue';
import HistoryPanel from './components/HistoryPanel.vue';
import { History, Share2 } from 'lucide-vue-next';

const shareCopied = ref(false);
let shareFeedbackTimer = null;
const historyOpen = ref(false);

function copyShareLink() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    shareCopied.value = true;
    if (shareFeedbackTimer) clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = setTimeout(() => {
      shareCopied.value = false;
    }, 2000);
  });
}
</script>

<template>
  <div class="min-h-screen transition-colors duration-300">
    <div class="mx-auto flex min-h-screen max-w-6xl flex-col px-3 pb-6 pt-3 sm:px-6 sm:pb-8 sm:pt-4 lg:px-8">
      <header class="studio-panel overflow-hidden">
        <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 via-amber-300 to-teal-500"></div>
        <div class="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5 lg:px-7">
          <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div class="flex items-start gap-3 sm:gap-4">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-stone-900/10 bg-stone-950 text-xl text-amber-200 shadow-lg sm:h-14 sm:w-14 sm:text-2xl dark:border-white/10 dark:bg-amber-50 dark:text-stone-900">
                TTS
              </div>
              <div class="min-w-0 space-y-2">
                <div class="studio-chip border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
                  Browser Voice Studio
                </div>
                <div>
                  <p class="max-w-2xl text-sm leading-6 text-stone-600 dark:text-stone-300">
Convert text to speech directly in your browser with local modeling and quickly export WAV files.                  </p>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-white px-3.5 py-2 text-sm font-semibold text-stone-700 transition hover:-translate-y-0.5 hover:border-orange-300 hover:text-orange-700 sm:px-4 dark:border-white/10 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-orange-400/40 dark:hover:text-orange-200"
                :class="shareCopied ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200' : ''"
                @click="copyShareLink"
              >
                <Share2 class="h-4 w-4" />
                {{ shareCopied ? 'copied' : 'Share' }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-white px-3.5 py-2 text-sm font-semibold text-stone-700 transition hover:-translate-y-0.5 hover:border-teal-300 hover:text-teal-700 sm:px-4 dark:border-white/10 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-teal-400/40 dark:hover:text-teal-200"
                :class="historyOpen ? 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-400/30 dark:bg-teal-500/10 dark:text-teal-200' : ''"
                @click="historyOpen = !historyOpen"
              >
                <History class="h-4 w-4" />
              History              </button>
              <ThemeToggle />
            </div>
          </div>

          <div class="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p class="mono-ui mb-2 text-xs uppercase tracking-[0.28em] text-stone-500 dark:text-stone-400">Modes</p>
              <nav class="flex flex-wrap gap-2" role="tablist" aria-label="Chon che do TTS hoac ASR">
                <router-link
                  to="/"
                  role="tab"
                  class="rounded-2xl border px-4 py-2.5 text-sm font-semibold transition sm:py-3"
                  :class="$route.path === '/' ? 'border-stone-900 bg-stone-950 text-amber-100 dark:border-amber-200 dark:bg-amber-100 dark:text-stone-900' : 'border-stone-900/10 bg-white/80 text-stone-700 hover:border-orange-300 hover:text-orange-700 dark:border-white/10 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:border-orange-400/40 dark:hover:text-orange-200'"
                >
                  TTS Vietnamese
                </router-link>
                <router-link
                  to="/en"
                  role="tab"
                  class="rounded-2xl border px-4 py-2.5 text-sm font-semibold transition sm:py-3"
                  :class="$route.path === '/en' ? 'border-stone-900 bg-stone-950 text-amber-100 dark:border-amber-200 dark:bg-amber-100 dark:text-stone-900' : 'border-stone-900/10 bg-white/80 text-stone-700 hover:border-orange-300 hover:text-orange-700 dark:border-white/10 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:border-orange-400/40 dark:hover:text-orange-200'"
                >
                  TTS English
                </router-link>
                <!-- <router-link
                  to="/id"
                  role="tab"
                  class="rounded-2xl border px-4 py-3 text-sm font-semibold transition"
                  :class="$route.path === '/id' ? 'border-stone-900 bg-stone-950 text-amber-100 dark:border-amber-200 dark:bg-amber-100 dark:text-stone-900' : 'border-stone-900/10 bg-white/80 text-stone-700 hover:border-orange-300 hover:text-orange-700 dark:border-white/10 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:border-orange-400/40 dark:hover:text-orange-200'"
                >
                  TTS Indonesia
                </router-link> -->
                <!-- <router-link
                  to="/asr"
                  role="tab"
                  class="rounded-2xl border px-4 py-3 text-sm font-semibold transition"
                  :class="$route.path === '/asr' ? 'border-stone-900 bg-stone-950 text-amber-100 dark:border-amber-200 dark:bg-amber-100 dark:text-stone-900' : 'border-stone-900/10 bg-white/80 text-stone-700 hover:border-orange-300 hover:text-orange-700 dark:border-white/10 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:border-orange-400/40 dark:hover:text-orange-200'"
                >
                  ASR Nhan dang giong noi
                </router-link> -->
              </nav>
            </div>

            <div class="rounded-2xl border border-stone-900/10 bg-white/70 px-4 py-3 text-sm leading-6 text-stone-600 dark:border-white/10 dark:bg-stone-900/60 dark:text-stone-300">
              <span class="mono-ui block text-xs uppercase tracking-[0.24em] text-stone-400 dark:text-stone-500">Workflow</span>
Enter text, select model, press play, download WAV.            </div>
          </div>
        </div>
      </header>

      <main class="flex-1 pt-5">
        <RouterView />
      </main>
    </div>

    <HistoryPanel :open="historyOpen" @close="historyOpen = false" />
  </div>
</template>
