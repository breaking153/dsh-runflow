import { useEffect, useRef } from 'react'

const dialogStack: HTMLElement[] = []
const focusableSelector = 'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]'

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(element => {
    if (element.tabIndex < 0 || element.matches(':disabled, input[type="hidden"]')
      || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
    for (let current: HTMLElement | null = element; current !== null; current = current.parentElement) {
      const style = getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      if (current === dialog) break
    }
    return true
  })
}

/** Keep modal focus local without resetting it when inline callbacks rerender. */
export function useDialogFocus(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || dialog === null) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    dialogStack.push(dialog)
    const isTop = () => dialogStack.at(-1) === dialog
    const focusFirst = () => (focusableElements(dialog)[0] ?? dialog).focus()
    const initial = dialog.querySelector<HTMLElement>('[data-dialog-autofocus]')
    if (initial !== null && focusableElements(dialog).includes(initial)) initial.focus()
    else focusFirst()

    const onFocus = (event: FocusEvent) => {
      if (isTop() && event.target instanceof Node && !dialog.contains(event.target)) focusFirst()
    }
    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return
      // React handlers run first, allowing editors to consume Escape/Tab.
      if (!event.defaultPrevented && event.key === 'Escape' && !event.isComposing) {
        event.preventDefault()
        closeRef.current()
      } else if (!event.defaultPrevented && event.key === 'Tab') {
        const elements = focusableElements(dialog)
        const first = elements[0]
        const last = elements.at(-1)
        if (first === undefined) {
          event.preventDefault()
          dialog.focus()
        } else if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement as HTMLElement))) {
          event.preventDefault()
          first.focus()
        }
      }
      // The canvas listens at window level; its commands must not run behind a modal.
      event.stopPropagation()
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('keydown', onKey)
      const wasTop = isTop()
      const index = dialogStack.indexOf(dialog)
      if (index >= 0) dialogStack.splice(index, 1)
      if (wasTop && previous?.isConnected) previous.focus()
    }
  }, [open])
  return dialogRef
}
