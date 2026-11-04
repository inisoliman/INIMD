import { useEffect } from 'react'
import { useI18n } from '../lib/i18n'
import { Icon } from './Icon'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  width?: number
  closeOnBackdrop?: boolean
}

export function Modal({ title, onClose, children, footer, width = 560, closeOnBackdrop = true }: ModalProps): React.ReactElement {
  const { t } = useI18n()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} title={t('modal.close')}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

export interface DialogButton {
  label: string
  kind?: 'primary' | 'ghost' | 'danger'
  action: () => void
}

interface ConfirmDialogProps {
  title: string
  message: string
  buttons: DialogButton[]
  onClose: () => void
}

export function ConfirmDialog({ title, message, buttons, onClose }: ConfirmDialogProps): React.ReactElement {
  return (
    <Modal title={title} onClose={onClose} width={480}>
      <p className="dialog-message">{message}</p>
      <div className="dialog-actions">
        {buttons.map((button) => (
          <button
            key={button.label}
            className={button.kind === 'primary' ? 'primary-btn' : button.kind === 'danger' ? 'danger-btn' : 'ghost-btn'}
            onClick={() => {
              onClose()
              button.action()
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
    </Modal>
  )
}
