import type { BrandingMode, SkinName } from './types'

export function composerPlaceholder(skin: SkinName, branding: BrandingMode): string {
  if (branding === 'neutral') {
    return skin === 'gemini' ? '询问 AI 助手' : '询问 Chat'
  }
  return skin === 'gemini' ? '问问 Gemini' : '问问 ChatGPT'
}

export function chatFooterText(skin: SkinName): string {
  return skin === 'gemini'
    ? 'Gemini 是一款 AI 工具，其回答未必正确无误。'
    : 'ChatGPT 可能会出错。请核查重要信息。'
}

export function toolsLabel(skin: SkinName): string {
  return skin === 'gemini' ? '技能' : '工具'
}

/** Model chip shown inside the composer, mirroring each product's picker. */
export function modelLabel(skin: SkinName, branding: BrandingMode): string {
  if (branding === 'neutral') return skin === 'gemini' ? '标准' : '默认'
  return skin === 'gemini' ? 'Pro' : 'Instant'
}

/** Account plan line under the account name in the rail. */
export function accountPlanText(skin: SkinName, vipType: number | undefined): string {
  const paid = vipType === 1
  if (skin === 'gemini') return paid ? 'Pro' : '免费版'
  return paid ? 'Plus' : 'Free'
}
