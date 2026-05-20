<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { formatModelDisplayName } from '../config.js';

const props = defineProps({
  models: {
    type: Array,
    required: true
  },
  selectedModel: {
    type: String,
    required: false,
    default: ''
  }
});

const emit = defineEmits(['modelChange']);

const rootRef = ref(null);
const open = ref(false);

const options = computed(() => props.models);
const selectedModelLabel = computed(() => formatModelDisplayName(props.selectedModel));

const toggleOpen = () => {
  open.value = !open.value;
};

const selectModel = (model) => {
  if (model !== props.selectedModel) {
    emit('modelChange', model);
  }
  open.value = false;
};

const closeOnOutsideClick = (event) => {
  if (!rootRef.value?.contains(event.target)) {
    open.value = false;
  }
};

const handleEscape = (event) => {
  if (event.key === 'Escape') {
    open.value = false;
  }
};

onMounted(() => {
  document.addEventListener('mousedown', closeOnOutsideClick);
  document.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', closeOnOutsideClick);
  document.removeEventListener('keydown', handleEscape);
});
</script>

<template>
  <div ref="rootRef" class="relative flex-1">
    <button
      id="model-selector"
      type="button"
      class="flex w-full items-center justify-between rounded-[18px] border-0 bg-transparent px-4 py-3 text-left text-sm font-medium text-stone-800 transition focus:outline-none dark:text-stone-100"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleOpen"
    >
      <span class="truncate">{{ selectedModelLabel }}</span>
      <svg
        class="h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 dark:text-stone-400"
        :class="open ? 'rotate-180' : ''"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[22px] border border-stone-200/90 bg-white/96 p-2 shadow-[0_22px_44px_rgba(28,25,23,0.16)] backdrop-blur-sm dark:border-stone-700 dark:bg-stone-950/96"
    >
      <div class="max-h-64 overflow-y-auto">
        <button
          v-for="model in options"
          :key="model"
          type="button"
          role="option"
          class="flex w-full items-center rounded-2xl px-4 py-3 text-left text-sm font-medium transition"
          :class="model === selectedModel
            ? 'bg-stone-950 text-amber-100 dark:bg-amber-100 dark:text-stone-900'
            : 'text-stone-700 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-200 dark:hover:bg-stone-900 dark:hover:text-amber-50'"
          :aria-selected="model === selectedModel"
          @click="selectModel(model)"
        >
          <span class="truncate">{{ formatModelDisplayName(model) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
