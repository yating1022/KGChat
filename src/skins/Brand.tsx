import geminiSparkleUrl from '../assets/gemini-sparkle.svg'
import {
  NEUTRAL_CHAT_PATH,
  NEUTRAL_SPARK_PATH,
  OPENAI_MARK_PATH,
} from './brandPaths'
import { useSkinOptional } from './SkinProvider'
import type { BrandingMode, SkinName } from './types'

export interface BrandProps {
  skin?: SkinName
  branding?: BrandingMode
  size?: number
  showWordmark?: boolean
  className?: string
}

function labelFor(skin: SkinName, branding: BrandingMode): string {
  if (branding === 'neutral') return 'AI 助手'
  return skin === 'gemini' ? 'Gemini' : 'ChatGPT'
}

export function Brand({
  skin: skinProp,
  branding: brandingProp,
  size = 24,
  showWordmark = true,
  className,
}: BrandProps) {
  const context = useSkinOptional()
  const skin = skinProp ?? context?.skin ?? 'gemini'
  const branding = brandingProp ?? context?.branding ?? 'official'
  const label = labelFor(skin, branding)

  return (
    <span
      className={[
        'brand',
        `brand--${skin}`,
        `brand--${branding}`,
        showWordmark ? 'brand--wordmark' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
    >
      <span className="brand-mark" aria-hidden="true">
        {branding === 'neutral' ? (
          skin === 'gemini' ? (
            <svg width={size} height={size} viewBox="0 0 24 24" focusable="false">
              <path d={NEUTRAL_SPARK_PATH} fill="currentColor" />
            </svg>
          ) : (
            <svg width={size} height={size} viewBox="0 0 24 24" focusable="false">
              <path d={NEUTRAL_CHAT_PATH} fill="currentColor" />
            </svg>
          )
        ) : skin === 'gemini' ? (
          <img
            className="brand-sparkle"
            src={geminiSparkleUrl}
            width={size}
            height={size}
            alt=""
            draggable={false}
          />
        ) : (
          <svg width={size} height={size} viewBox="0 0 24 24" focusable="false">
            <path d={OPENAI_MARK_PATH} fill="currentColor" />
          </svg>
        )}
      </span>
      {showWordmark ? <span className="brand-wordmark">{label}</span> : null}
    </span>
  )
}
