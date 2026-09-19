import { z } from 'zod'

export const deploymentSettingsSchema = z.object({
  slug: z
    .string()
    .max(63)
    .regex(/^[a-z0-9-]*$/),
  channel: z
    .string()
    .max(32)
    .regex(/^[a-z0-9-]*$/),
  spaFallback: z.boolean(),
  privateDeploy: z.boolean(),
})
export type DeploymentSettings = z.infer<typeof deploymentSettingsSchema>
export const deploymentPresetsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(60),
      settings: deploymentSettingsSchema,
    }),
  )
  .max(12)
export type DeploymentPreset = z.infer<typeof deploymentPresetsSchema>[number]
export function saveDeploymentPreset(
  presets: Array<DeploymentPreset>,
  name: string,
  settings: unknown,
) {
  const clean = z.string().trim().min(1).max(60).parse(name)
  const next = {
    name: clean,
    settings: deploymentSettingsSchema.parse(settings),
  }
  const existing = presets.some(
    (preset) => preset.name.toLowerCase() === clean.toLowerCase(),
  )
  return deploymentPresetsSchema.parse(
    existing
      ? presets.map((preset) =>
          preset.name.toLowerCase() === clean.toLowerCase() ? next : preset,
        )
      : [...presets, next],
  )
}
