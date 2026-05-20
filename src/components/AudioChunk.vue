<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';

const props = defineProps({
  audio: {
    type: Blob,
    required: true
  },
  active: {
    type: Boolean,
    required: true
  },
  playing: {
    type: Boolean,
    required: true
  },
  playbackRate: {
    type: Number,
    default: 1
  },
  onStart: {
    type: Function,
    default: () => {}
  },
  onEnd: {
    type: Function,
    default: () => {}
  },
  onPause: {
    type: Function,
    default: () => {}
  },
  onTimeUpdate: {
    type: Function,
    default: () => {}
  },
  onLoadedMetadata: {
    type: Function,
    default: () => {}
  }
});

const audioRef = ref(null);

// Create URL for the audio blob
const url = computed(() => {
  return URL.createObjectURL(props.audio);
});

const handlePause = () => {
  if (audioRef.value?.ended) return;
  props.onPause();
}

const handleTimeUpdate = () => {
  if (!audioRef.value) return;
  props.onTimeUpdate(audioRef.value.currentTime);
}

const handleLoadedMetadata = () => {
  if (!audioRef.value) return;
  props.onLoadedMetadata(audioRef.value.duration || 0);
}

// Watch for changes in active/playing state
watch([() => props.active, () => props.playing], ([newActive, newPlaying]) => {
  if (!audioRef.value) return;
  if (!newActive) {
    audioRef.value.pause();
    audioRef.value.currentTime = 0;
    return;
  }

  if (newPlaying) {
    if (audioRef.value.ended) {
      audioRef.value.currentTime = 0;
    }
    audioRef.value.play();
  } else {
    audioRef.value.pause();
  }
});

watch(() => props.playbackRate, (newRate) => {
  if (!audioRef.value) return;
  audioRef.value.playbackRate = newRate || 1;
});

// Handle audio element lifecycle
onMounted(() => {
  if (!props.audio) return;
  if (!audioRef.value) return;

  if (props.active) {
    audioRef.value.playbackRate = props.playbackRate || 1;
    audioRef.value.play();
    audioRef.value.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  } else {
    audioRef.value.pause();
    audioRef.value.currentTime = 0;
  }
})

onUnmounted(() => {
  // Revoke the object URL to free memory
  URL.revokeObjectURL(url.value);
});
</script>

<template>
  <audio
    ref="audioRef"
    :src="url"
    controls
    @play="onStart"
    @pause="handlePause"
    @timeupdate="handleTimeUpdate"
    @loadedmetadata="handleLoadedMetadata"
    @ended="onEnd"
  ></audio>
</template>
