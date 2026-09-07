type HashRequest = { files: Array<{ path: string; file: File }> }
self.onmessage = async (event: MessageEvent<HashRequest>) => {
  try {
    const checksums: Array<[string, string]> = []
    for (const item of event.data.files) {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        await item.file.arrayBuffer(),
      )
      checksums.push([
        item.path,
        Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join(''),
      ])
      self.postMessage({ completed: checksums.length })
    }
    self.postMessage({ checksums })
  } catch {
    self.postMessage({
      error: 'Could not read the selected files. Select them again and retry.',
    })
  }
}
