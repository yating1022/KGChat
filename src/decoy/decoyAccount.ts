import type { SkinName } from '../skins/types'

export interface DecoyAccount {
  name: string
  plan: string
  initial: string
}

/**
 * Cover account used by the quick-hide rail when no signed-in profile is
 * available. Conversations always come from the imported list; only the
 * account line is pre-set here.
 */
export const DECOY_ACCOUNTS: Record<SkinName, DecoyAccount> = {
  gemini: { name: 'Pn L', plan: 'Pro', initial: 'P' },
  chatgpt: { name: '鈴木 たくみ', plan: 'Plus', initial: 'S' },
}
