import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import geminiSparkleUrl from '../assets/gemini-sparkle.svg'
import { useSettingsStore } from '../settings/settingsStore'
import {
  NEUTRAL_CHAT_PATH,
  NEUTRAL_SPARK_PATH,
  OPENAI_MARK_PATH,
} from './brandPaths'
import type { BrandingMode, ResolvedTheme, SkinName, ThemePreference } from './types'

export interface SkinContextValue {
  skin: SkinName
  branding: BrandingMode
  theme: ThemePreference
  resolvedTheme: ResolvedTheme
  setSkin(skin: SkinName): void
  setTheme(theme: ThemePreference): void
  setBranding(branding: BrandingMode): void
}

const SkinContext = createContext<SkinContextValue | null>(null)

export function useSkin(): SkinContextValue {
  const value = useContext(SkinContext)
  if (!value) {
    throw new Error('useSkin must be used inside SkinProvider')
  }
  return value
}

export function useSkinOptional(): SkinContextValue | null {
  return useContext(SkinContext)
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function titleFor(skin: SkinName, branding: BrandingMode): string {
  if (branding === 'neutral') return 'AI 助手'
  return skin === 'gemini' ? 'Gemini' : 'ChatGPT'
}

function faviconFor(
  skin: SkinName,
  branding: BrandingMode,
  resolvedTheme: ResolvedTheme,
): string {
  const background = resolvedTheme === 'dark' ? '#1e1f20' : '#ffffff'

  if (branding === 'official' && skin === 'gemini') {
    // Same asset the hosted product serves for its tab icon.
    return geminiSparkleUrl
  }

  const path =
    branding === 'official'
      ? OPENAI_MARK_PATH
      : skin === 'gemini'
        ? NEUTRAL_SPARK_PATH
        : NEUTRAL_CHAT_PATH

  const foreground =
    branding === 'neutral'
      ? resolvedTheme === 'dark'
        ? '#e3e3e3'
        : '#5f6368'
      : resolvedTheme === 'dark'
        ? '#ececec'
        : '#0d0d0d'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${background}"/><path d="${path}" transform="scale(2.6667)" fill="${foreground}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function applyFavicon(href: string): void {
  if (typeof document === 'undefined') return

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = 'image/svg+xml'
  link.href = href
}

export interface SkinProviderProps {
  children: ReactNode
}

/**
 * Owns `data-skin`, `data-theme`, and `data-branding` on `<html>` plus the
 * neutral document title/favicon pair. Switching skins never touches chat data.
 */
export function SkinProvider({ children }: SkinProviderProps) {
  const skin = useSettingsStore((state) => state.skin)
  const theme = useSettingsStore((state) => state.theme)
  const branding = useSettingsStore((state) => state.branding)
  const setSkin = useSettingsStore((state) => state.setSkin)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const setBranding = useSettingsStore((state) => state.setBranding)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystemTheme)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => setSystemTheme(media.matches ? 'dark' : 'light')
    handleChange()

    media.addEventListener?.('change', handleChange)
    return () => media.removeEventListener?.('change', handleChange)
  }, [])

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme

  useEffect(() => {
    const root = document.documentElement
    root.dataset.skin = skin
    root.dataset.theme = resolvedTheme
    root.dataset.branding = branding
    root.style.colorScheme = resolvedTheme
    document.title = titleFor(skin, branding)
    applyFavicon(faviconFor(skin, branding, resolvedTheme))
  }, [skin, theme, branding, resolvedTheme])

  const value = useMemo<SkinContextValue>(
    () => ({
      skin,
      branding,
      theme,
      resolvedTheme,
      setSkin,
      setTheme,
      setBranding,
    }),
    [skin, branding, theme, resolvedTheme, setSkin, setTheme, setBranding],
  )

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>
}
