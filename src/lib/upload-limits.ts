export const MAX_FILE_COUNT = 5_000
export const DEFAULT_MAX_DEPLOY_BYTES = 500 * 1024 * 1024
export function deployByteLimit(value?: string) {
  const parsed = value?.trim() ? Number(value) : NaN
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_MAX_DEPLOY_BYTES
}
export function uploadLimitErrors(
  count: number,
  bytes: number,
  limits: { maxFileCount: number; maxDeployBytes: number },
) {
  const errors: Array<string> = []
  if (count > limits.maxFileCount)
    errors.push(
      `${count.toLocaleString()} files selected; the limit is ${limits.maxFileCount.toLocaleString()}.`,
    )
  if (bytes > limits.maxDeployBytes)
    errors.push(
      `${bytes.toLocaleString()} bytes selected; the limit is ${limits.maxDeployBytes.toLocaleString()} bytes.`,
    )
  return errors
}
