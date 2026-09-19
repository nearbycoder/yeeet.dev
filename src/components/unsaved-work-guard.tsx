import { useBlocker } from '@tanstack/react-router'
import { ConfirmDialog } from './confirm-dialog'

export function UnsavedWorkGuard({
  dirty,
  description,
  watchSearch = true,
}: {
  dirty: boolean
  description: string
  watchSearch?: boolean
}) {
  const blocker = useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
    shouldBlockFn: ({ current, next }) =>
      dirty &&
      (current.pathname !== next.pathname ||
        (watchSearch &&
          JSON.stringify(current.search) !== JSON.stringify(next.search))),
  })
  return (
    <ConfirmDialog
      open={blocker.status === 'blocked'}
      title="Leave unsaved work?"
      description={description}
      tone="neutral"
      eyebrow="UNSAVED WORK"
      cancelLabel="Keep working"
      confirmLabel="Leave page"
      onCancel={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
    />
  )
}
