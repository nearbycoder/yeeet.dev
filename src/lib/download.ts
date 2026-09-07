export function csvCell(value: string | number | null) {
  let text = String(value ?? '')
  if (/^\s*[=+@-]/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function toCsv(rows: Array<Array<string | number | null>>) {
  return (
    '\uFEFF' +
    rows.map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  )
}
export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
