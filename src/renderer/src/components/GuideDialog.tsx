import { useI18n } from '../lib/i18n'
import type { MessageKey } from '@shared/i18n'
import { Modal } from './Modal'

interface GuideDialogProps {
  onClose: () => void
}

const SHORTCUTS: [string, MessageKey][] = [
  ['Ctrl + N', 'guide.shortcut.new'],
  ['Ctrl + O', 'guide.shortcut.open'],
  ['Ctrl + S', 'guide.shortcut.save'],
  ['Ctrl + Shift + S', 'guide.shortcut.saveAs'],
  ['Ctrl + W', 'guide.shortcut.closeTab'],
  ['Ctrl + F', 'guide.shortcut.find'],
  ['Ctrl + B', 'guide.shortcut.sidebar'],
  ['Ctrl + Shift + V', 'guide.shortcut.preview'],
  ['Ctrl + Alt + P', 'guide.shortcut.pdf'],
  ['Ctrl + Alt + W', 'guide.shortcut.word'],
  ['Ctrl + ,', 'guide.shortcut.settings']
]

export function GuideDialog({ onClose }: GuideDialogProps): React.ReactElement {
  const { t } = useI18n()

  return (
    <Modal title={t('guide.title')} onClose={onClose} width={640}>
      <div className="guide">
        <section>
          <h3>{t('guide.start')}</h3>
          <ul>
            <li>{t('guide.start1')}</li>
            <li>{t('guide.start2')}</li>
            <li>{t('guide.start3')}</li>
          </ul>
        </section>

        <section>
          <h3>{t('guide.arabic')}</h3>
          <ul>
            <li>{t('guide.arabic1')}</li>
            <li>{t('guide.arabic2')}</li>
            <li>{t('guide.arabic3')}</li>
            <li>{t('guide.arabic4')}</li>
          </ul>
        </section>

        <section>
          <h3>{t('guide.export')}</h3>
          <ul>
            <li>{t('guide.exportPdf')}</li>
            <li>{t('guide.exportWord')}</li>
          </ul>
        </section>

        <section>
          <h3>{t('guide.shortcuts')}</h3>
          <div className="shortcut-grid">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={keys} className="shortcut-row">
                <kbd dir="ltr">{keys}</kbd>
                <span>{t(label)}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3>{t('guide.format')}</h3>
          <p className="guide-note">{t('guide.formatBody')}</p>
        </section>
      </div>
    </Modal>
  )
}
