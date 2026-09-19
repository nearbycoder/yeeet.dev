export const TEXT_PREVIEW_BYTES = 64 * 1024
export function canPreviewText(contentType: string) {
  const type = contentType.split(';')[0].trim().toLowerCase()
  return (
    type.startsWith('text/') ||
    /^application\/(json|javascript|xml|x-javascript|[a-z0-9.+-]+\+(json|xml))$/.test(
      type,
    ) ||
    type === 'image/svg+xml'
  )
}
