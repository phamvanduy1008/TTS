/**
 * Config for i18n (non-Vietnamese) TTS pages.
 * - Local: models from public/tts-model/{lang}/
 * - Production: models from /api/model/piper/{lang}/
 */

export const REMOTE_PIPER_HOST = (import.meta.env.VITE_REMOTE_PIPER_HOST || '').trim();
export const REMOTE_VI_MODELS_FALLBACK = ['minhquang', 'ngochuyen'];
export const REMOTE_LANG_MODELS_FALLBACK = {
  en: ['mattheo'],
  id: [],
};

const REMOTE_MODEL_LABELS = {
  banmai: 'Ban Mai',
  duyourynx: 'Duy Orynx',
  minhquang: 'Minh Quang',
  ngocgan: 'Ngọc Ngạn',
  ngochuyen: 'Ngọc Huyền',
};

function getRemotePiperHostBase() {
  return REMOTE_PIPER_HOST.replace(/\/$/, '');
}

function getHuggingFaceRepoInfo() {
  if (!REMOTE_PIPER_HOST) return null;

  try {
    const url = new URL(REMOTE_PIPER_HOST);
    if (url.hostname !== 'huggingface.co') return null;

    const segments = url.pathname.split('/').filter(Boolean);
    const resolveIndex = segments.indexOf('resolve');

    if (resolveIndex < 2 || resolveIndex === segments.length - 1) {
      return null;
    }

    const owner = segments[0];
    const repo = segments[1];
    const revision = segments[resolveIndex + 1];
    const basePath = segments.slice(resolveIndex + 2).join('/');

    return {
      repoId: `${owner}/${repo}`,
      revision,
      basePath,
    };
  } catch {
    return null;
  }
}

function getHuggingFaceTreeUrl(lang) {
  const repoInfo = getHuggingFaceRepoInfo();
  if (!repoInfo) return null;

  const path = [repoInfo.basePath, lang].filter(Boolean).join('/');
  return `https://huggingface.co/api/models/${repoInfo.repoId}/tree/${repoInfo.revision}/${path}`;
}

export async function fetchRemoteModelsFromHost(lang) {
  const treeUrl = getHuggingFaceTreeUrl(lang);
  const staticFallback = lang === 'vi'
    ? REMOTE_VI_MODELS_FALLBACK
    : (REMOTE_LANG_MODELS_FALLBACK[lang] || []);

  if (!treeUrl) {
    return staticFallback;
  }

  try {
    const response = await fetch(treeUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Remote model list request failed: ${response.status}`);
    }

    const entries = await response.json();
    const models = Array.isArray(entries)
      ? [...new Set(entries
          .map((entry) => entry?.path || entry?.rfilename || '')
          .filter((path) => typeof path === 'string' && path.endsWith('.onnx.json'))
          .map((path) => path.split('/').pop()?.replace(/\.onnx\.json$/, ''))
          .filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
      : [];

    return models.length > 0 ? models : staticFallback;
  } catch (error) {
    console.error(`Failed to load remote models for ${lang}:`, error);
    return staticFallback;
  }
}

export function formatModelDisplayName(modelName) {
  return REMOTE_MODEL_LABELS[modelName] || modelName;
}

export function getModelBaseUrl(lang) {
  if (import.meta.env.PROD) {
    return `/api/model/piper/${lang}/`;
  }
  return `${import.meta.env.BASE_URL}tts-model/${lang}/`;
}

/**
 * API URL to list models for a language.
 * Local: Vite middleware /api/piper/:lang/models
 * Production: Cloudflare /api/piper/:lang/models
 */
export function getModelsListUrl(lang) {
  return `/api/piper/${lang}/models`;
}

export function getRemoteVietnameseModelBaseUrl() {
  return `${getRemotePiperHostBase()}/vi/`;
}

export function getRemoteLanguageModelBaseUrl(lang) {
  return `${getRemotePiperHostBase()}/${lang}/`;
}

export function getVietnameseModelAssetCandidates(modelName) {
  const encodedModel = encodeURIComponent(modelName);
  return {
    modelPaths: [
      `/api/model/${encodedModel}.onnx`,
      `${getRemoteVietnameseModelBaseUrl()}${encodedModel}.onnx`,
    ],
    configPaths: [
      `/api/model/${encodedModel}.onnx.json`,
      `${getRemoteVietnameseModelBaseUrl()}${encodedModel}.onnx.json`,
    ],
  };
}

export function getLanguageModelAssetCandidates(lang, modelName) {
  const encodedModel = encodeURIComponent(modelName);
  const localBase = getModelBaseUrl(lang);
  const remoteBase = getRemoteLanguageModelBaseUrl(lang);

  return {
    modelPaths: [
      `${localBase}${encodedModel}.onnx`,
      `${remoteBase}${encodedModel}.onnx`,
    ],
    configPaths: [
      `${localBase}${encodedModel}.onnx.json`,
      `${remoteBase}${encodedModel}.onnx.json`,
    ],
  };
}

/** Default model names per language when no API is used (e.g. local fallback). */
export const DEFAULT_LANG_MODELS = {
  en: [],
  id: [],
};

/** Default model name to auto-load per language. If not set, first available model is used. */
export const DEFAULT_MODEL = {
  vi: 'ngochuyen',
  en: 'mattheo',
  id: 'Indo_goreng',
};

/** Default ASR model name when none selected. Local: public/asr-model/{name}/. Production: R2 asr/{name}/. */
export const DEFAULT_ASR_MODEL = 'nghi-stt';

/** Fallback ASR model list when /api/asr/models fails or returns empty (e.g. production before R2 list works). */
export const ASR_MODELS_FALLBACK = ['nghi-stt-v2', 'sherpa-onnx-zipformer-vi-int8-2025-10-16'];

/** localStorage key for user-selected ASR model. */
export const ASR_MODEL_STORAGE_KEY = 'asr-selected-model';

/** API URL to list available ASR models. Local: Vite middleware. Production: Cloudflare /api/asr/models */
export function getASRModelsListUrl() {
  return '/api/asr/models';
}

/** Shared ASR scripts (same for all models). Served from public/code/asr-wasm/. */
export const ASR_CODE_BASE = '/code/asr-wasm/';

/** Model-specific ASR filenames (.wasm, .data, main .js); each model has its own. */
const ASR_MODEL_FILES = ['sherpa-onnx-wasm-main-vad-asr.wasm', 'sherpa-onnx-wasm-main-vad-asr.data', 'sherpa-onnx-wasm-main-vad-asr.js'];

/**
 * ASR WASM assets (sherpa-onnx VAD+ASR).
 * - Shared scripts (sherpa-onnx-asr.js, sherpa-onnx-vad.js, app-vad-asr.js): use ASR_CODE_BASE (/code/asr-wasm/).
 * - Model-specific (.wasm, .data, sherpa-onnx-wasm-main-vad-asr.js): local from asr-model/{model}/, production from R2 asr/{model}/ via /api/model/asr/{model}/.
 */
export function getASRAssetUrl(filename, model = DEFAULT_ASR_MODEL) {
  if (ASR_MODEL_FILES.includes(filename)) {
    if (import.meta.env.PROD) {
      return `/api/model/asr/${model}/${filename}`;
    }
    return `${import.meta.env.BASE_URL || '/'}asr-model/${model}/${filename}`;
  }
  return `${import.meta.env.BASE_URL || '/'}asr-wasm/${filename}`;
}
