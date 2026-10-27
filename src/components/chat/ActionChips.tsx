import type { ChatAction } from '../../chat/chatTypes'

export interface ActionChipsProps {
  actions: ChatAction[]
  prompt?: string
  onAction: (action: ChatAction) => void
  favoriteIds?: readonly number[]
}

export function ActionChips({ actions, prompt, onAction, favoriteIds = [] }: ActionChipsProps) {
  if (actions.length === 0) return null

  return (
    <div className="action-chips">
      {prompt ? <span className="action-prompt">{prompt}</span> : null}
      <div className="action-chip-row">
        {actions.map((action) => {
          const favorite = action.kind === 'favorite' && favoriteIds.includes(Number(action.value))
          const label = favorite ? '取消收藏' : action.label

          return (
            <button
              key={`${action.kind}-${action.label}`}
              type="button"
              className={`action-chip action-chip--${action.kind}`}
              onClick={() => onAction(action)}
              disabled={action.disabled}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
