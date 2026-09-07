export function currentHealthPassed(
  health: {
    deploymentId: string | null
    checkedAt: Date | null
    responseStatus: number | null
    expectedStatus: number
    error: string | null
  } | null,
  activeId: string | null,
  now = Date.now(),
) {
  return Boolean(
    activeId &&
    health?.deploymentId === activeId &&
    health.checkedAt &&
    now - health.checkedAt.getTime() >= 0 &&
    now - health.checkedAt.getTime() <= 15 * 60000 &&
    !health.error &&
    health.responseStatus === health.expectedStatus,
  )
}
