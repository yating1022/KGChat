import type { ToolKind } from '../../chat/chatTypes'
import { FavoritesPicker } from './FavoritesPicker'
import { PaperPicker } from './PaperPicker'
import { PracticeLogPicker } from './PracticeLogPicker'
import { SmartPicker } from './SmartPicker'
import { SpecialPicker } from './SpecialPicker'
import { WrongPicker } from './WrongPicker'

export interface PracticeToolProps {
  tool: ToolKind
  onOpenLogin?: () => void
}

/** Routes a chat `tool` message to the matching practice picker. */
export function PracticeTool({ tool, onOpenLogin }: PracticeToolProps) {
  switch (tool) {
    case 'practice':
      return <SmartPicker />
    case 'paper':
      return <PaperPicker />
    case 'special':
      return <SpecialPicker onOpenLogin={onOpenLogin} />
    case 'wrong':
      return <WrongPicker onOpenLogin={onOpenLogin} />
    case 'favorites':
      return <FavoritesPicker onOpenLogin={onOpenLogin} />
    case 'history':
      return <PracticeLogPicker onOpenLogin={onOpenLogin} />
    default:
      return null
  }
}
