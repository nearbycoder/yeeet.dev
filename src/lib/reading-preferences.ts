import { z } from 'zod'

export const readingPreferencesSchema = z.object({
  largeText: z.boolean(),
  reduceMotion: z.boolean(),
})
export const defaultReadingPreferences = {
  largeText: false,
  reduceMotion: false,
}
export const readingPreferencesKey = 'yeeet:reading-preferences:v1'
export function parseReadingPreferences(raw: string | null) {
  try {
    const parsed = readingPreferencesSchema.safeParse(JSON.parse(raw ?? 'null'))
    return parsed.success ? parsed.data : defaultReadingPreferences
  } catch {
    return defaultReadingPreferences
  }
}
export function applyReadingPreferences(
  value: typeof defaultReadingPreferences,
) {
  document.documentElement.dataset.largeText = String(value.largeText)
  document.documentElement.dataset.reduceMotion = String(value.reduceMotion)
}
