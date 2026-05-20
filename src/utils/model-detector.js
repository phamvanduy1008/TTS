import { REMOTE_VI_MODELS_FALLBACK, fetchRemoteModelsFromHost } from '../config.js';

/**
 * Fetches available TTS models from Cloudflare R2 via Pages Function
 * @returns {Promise<string[]>} Array of model names
 */
export async function fetchAvailableModels() {
  try {
    const response = await fetch('/api/models');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.message || data.error);
    }
    
    const models = data.models || [];
    return models.length > 0 ? models : await fetchRemoteModelsFromHost('vi');
  } catch (error) {
    console.error('Error fetching available models:', error);
    const remoteModels = await fetchRemoteModelsFromHost('vi');
    return remoteModels.length > 0 ? remoteModels : REMOTE_VI_MODELS_FALLBACK;
  }
}

