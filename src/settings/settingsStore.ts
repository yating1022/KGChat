import { create } from 'zustand'

import { DEFAULT_API_BASE_URL, normalizeBaseUrl } from '../api/client'
import {
  isBrandingMode,
  isSkinName,
  isThemePreference,
  type BrandingMode,
  type SkinName,
  type ThemePreference,
} from '../skins/types'

export const SETTINGS_STORAGE_KEY = 'saduck.settings'

export interface AppSettings {
  skin: SkinName
  theme: ThemePreference
  branding: BrandingMode
  apiBaseUrl: string
  quickHideEnabled: boolean
}

export interface SettingsStore extends AppSettings {
  setSkin(skin: SkinName): void
  setTheme(theme: ThemePreference): void
  setBranding(branding: BrandingMode): void
  setApiBaseUrl(apiBaseUrl: string): string
  setQuickHideEnabled(enabled: boolean): void
  reset(): void
}

export const DEFAULT_SETTINGS: AppSettings = {
  skin: 'gemini',
  theme: 'system',
  branding: 'official',
  apiBaseUrl: DEFAULT_API_BASE_URL,
  quickHideEnabled: true,
}

function sanitizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_API_BASE_URL
  try {
    return normalizeBaseUrl(value)
  } catch {
    return DEFAULT_API_BASE_URL
  }
}

/** Reads the optional QA overrides (`?skin=`, `?theme=`) without persisting them. */
function readQueryOverrides(): Partial<AppSettings> {
  if (typeof window === 'undefined') return {}

  try {
    const params = new URLSearchParams(window.location.search)
    const skin = params.get('skin')
    const theme = params.get('theme')
    const overrides: Partial<AppSettings> = {}

    if (isSkinName(skin)) overrides.skin = skin
    if (isThemePreference(theme)) overrides.theme = theme

    return overrides
  } catch {
    return {}
  }
}

function readStoredSettings(): AppSettings {
  const overrides = readQueryOverrides()

  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_SETTINGS, ...overrides }
  }

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS, ...overrides }

    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      skin: isSkinName(parsed.skin) ? parsed.skin : DEFAULT_SETTINGS.skin,
      theme: isThemePreference(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      branding: isBrandingMode(parsed.branding) ? parsed.branding : DEFAULT_SETTINGS.branding,
      apiBaseUrl: sanitizeBaseUrl(parsed.apiBaseUrl),
      quickHideEnabled:
        typeof parsed.quickHideEnabled === 'boolean'
          ? parsed.quickHideEnabled
          : DEFAULT_SETTINGS.quickHideEnabled,
      ...overrides,
    }
  } catch {
    return { ...DEFAULT_SETTINGS, ...overrides }
  }
}

function persistSettings(settings: AppSettings): void {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* Settings remain in memory when storage is unavailable. */
  }
}

const initialSettings = readStoredSettings()

export const useSettingsStore = create<SettingsStore>()((set, get) => {
  const apply = (partial: Partial<AppSettings>): void => {
    const next: AppSettings = {
      skin: get().skin,
      theme: get().theme,
      branding: get().branding,
      apiBaseUrl: get().apiBaseUrl,
      quickHideEnabled: get().quickHideEnabled,
      ...partial,
    }
    set(partial)
    persistSettings(next)
  }

  return {
    ...initialSettings,

    setSkin(skin) {
      apply({ skin })
    },

    setTheme(theme) {
      apply({ theme })
    },

    setBranding(branding) {
      apply({ branding })
    },

    setApiBaseUrl(apiBaseUrl) {
      const sanitized = sanitizeBaseUrl(apiBaseUrl)
      apply({ apiBaseUrl: sanitized })
      return sanitized
    },

    setQuickHideEnabled(quickHideEnabled) {
      apply({ quickHideEnabled })
    },

    reset() {
      set(DEFAULT_SETTINGS)
      persistSettings(DEFAULT_SETTINGS)
    },
  }
})
