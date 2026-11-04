import type { Tab } from '../types'
import { useI18n } from '../lib/i18n'
import { Icon } from './Icon'

interface TabBarProps {
  tabs: Tab[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export function TabBar({ tabs, activeId, onSelect, onClose, onNew }: TabBarProps): React.ReactElement {
  const { t } = useI18n()

  return (
    <div className="tabbar">
      <div className="tabs" role="tablist">
        {tabs.map((tab) => {
          const dirty = tab.content !== tab.savedContent
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeId}
              className={`tab ${tab.id === activeId ? 'active' : ''}`}
              onClick={() => onSelect(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) onClose(tab.id)
              }}
              title={tab.path ?? tab.name}
            >
              <span className={`tab-dot ${dirty ? 'on' : ''}`} />
              <span className="tab-name">{tab.name}</span>
              <button
                className="tab-close"
                title={t('tab.close')}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          )
        })}
      </div>
      <button className="tab-new" onClick={onNew} title={t('tab.new')}>
        <Icon name="new" size={16} />
      </button>
    </div>
  )
}
