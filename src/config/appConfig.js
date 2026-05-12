export const SETTINGS_STORAGE_KEY = 'bio-demo-settings'
export const SETTINGS_STORAGE_VERSION = 3
export const UI_STATE_STORAGE_KEY = 'bio-demo-ui-state'
export const UI_STATE_STORAGE_VERSION = 1
export const DEFAULT_SETTINGS = {
  quality: 'balanced',
  compactUi: false,
  generationProvider: 'tripo',
  generationMode: 'tripo',
  settingsVersion: SETTINGS_STORAGE_VERSION,
}

export const CUSTOM_CELL_STORAGE_KEY = 'bio-demo-custom-cells'
export const MAX_PERSISTED_IMAGE_EDGE = 1280
export const COMPACT_PERSISTED_IMAGE_EDGE = 900
export const MAX_PERSISTED_IMAGE_CHARS = 3_200_000
export const MODEL_API_BASE = import.meta.env.VITE_MODEL_API_BASE || import.meta.env.VITE_TRIPO_API_BASE || 'http://127.0.0.1:8787'
export const GENERATION_POLL_INTERVAL_MS = 3500
export const GENERATION_TIMEOUT_MS = 8 * 60 * 1000
export const GENERATION_PROVIDER_OPTIONS = [
  { id: 'auto', label: 'Auto', description: 'Tripo first, Rodin and Hunyuan backup.' },
  { id: 'tripo', label: 'Tripo', description: 'Cloud generation.' },
  { id: 'rodin', label: 'Rodin', description: 'Hyper3D Rodin cloud generation.' },
  { id: 'hunyuan', label: 'Hunyuan', description: 'Local Hunyuan3D server.' },
]
export const GENERATION_PROVIDER_IDS = new Set(GENERATION_PROVIDER_OPTIONS.map((provider) => provider.id))
export const GENERATION_MODE_OPTIONS = [
  { id: 'tripo', label: 'Tripo', description: 'Cloud GLB generation.' },
  { id: 'rodin', label: 'Rodin', description: 'Hyper3D Rodin GLB generation.' },
  { id: 'hunyuan', label: 'Hunyuan', description: 'Local Hunyuan3D GLB generation.' },
  { id: 'cinematic', label: 'JS Depth', description: 'Browser-side image relief with layered PNG fallback.' },
  { id: 'auto', label: 'Auto', description: 'Tripo, Rodin, Hunyuan, then JS Depth fallback.' },
  { id: 'local', label: 'Local GLB', description: 'Import an existing GLB or GLTF file.' },
]
export const GENERATION_MODE_IDS = new Set(GENERATION_MODE_OPTIONS.map((mode) => mode.id))
