import { ShenlunPicker } from './ShenlunPicker'

export interface ShenlunToolProps {
  onOpenLogin?: () => void
  variant?: 'inline' | 'drawer'
}

/** Chat tool surface for Shenlun papers and saved answer records. */
export function ShenlunTool({ onOpenLogin, variant = 'inline' }: ShenlunToolProps) {
  return (
    <div className={`practice-tool-host practice-tool-host--${variant}`}>
      <ShenlunPicker onOpenLogin={onOpenLogin} />
    </div>
  )
}
