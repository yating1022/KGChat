export type SkinName = 'gemini' | 'chatgpt'

export type ThemePreference = 'system' | 'light' | 'dark'

export type ResolvedTheme = 'light' | 'dark'

export type BrandingMode = 'official' | 'neutral'

export const SKIN_NAMES: readonly SkinName[] = ['gemini', 'chatgpt']

export const SKIN_LABELS: Record<SkinName, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
}

export function isSkinName(value: unknown): value is SkinName {
  return value === 'gemini' || value === 'chatgpt'
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function isBrandingMode(value: unknown): value is BrandingMode {
  return value === 'official' || value === 'neutral'
}
