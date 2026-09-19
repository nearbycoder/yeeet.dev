import { useEffect, useState } from 'react'
import {
  deploymentPresetsSchema,
  saveDeploymentPreset,
} from '#/lib/deployment-presets'
import type {
  DeploymentPreset,
  DeploymentSettings,
} from '#/lib/deployment-presets'

export function DeploymentPresets({
  userId,
  settings,
  disabled,
  onApply,
}: {
  userId: string
  settings: DeploymentSettings
  disabled: boolean
  onApply: (settings: DeploymentSettings) => void
}) {
  const [presets, setPresets] = useState<Array<DeploymentPreset>>([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const key = `yeeet:deployment-presets:v1:${userId}`
  useEffect(() => {
    try {
      setPresets(
        deploymentPresetsSchema.parse(
          JSON.parse(localStorage.getItem(key) ?? '[]'),
        ),
      )
    } catch {
      setPresets([])
      setMessage(
        'Saved presets could not be loaded. Saving replaces the unreadable record.',
      )
    }
  }, [key])
  function persist(next: Array<DeploymentPreset>, notice: string) {
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setPresets(next)
      setMessage(notice)
    } catch {
      setMessage('Browser storage is unavailable. Presets were not changed.')
    }
  }
  return (
    <details className="console-item">
      <summary>Deployment presets ({presets.length}/12)</summary>
      <p>
        Save address, channel, routing, and privacy choices in this browser for
        your account. Passwords and files are never saved. Applying a preset
        requires a new password for private sharing.
      </p>
      <form
        className="console-form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          try {
            persist(
              saveDeploymentPreset(presets, name, settings),
              'Preset saved.',
            )
          } catch {
            setMessage(
              'Use a name up to 60 characters and valid deployment settings. Delete a preset before adding more than 12.',
            )
          }
        }}
      >
        <label>
          Preset name
          <input
            name="preset-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            disabled={disabled}
          />
        </label>
        <button className="button button-paper" disabled={disabled}>
          Save deployment preset
        </button>
      </form>
      {message ? <p role="status">{message}</p> : null}
      <ul>
        {presets.map((preset) => (
          <li key={preset.name}>
            <button
              className="button button-paper"
              disabled={disabled}
              onClick={() => {
                onApply(preset.settings)
                setMessage(
                  `Applied ${preset.name}. Review the destination before deploying.`,
                )
              }}
            >
              Apply {preset.name}
            </button>{' '}
            <button
              className="button danger-link"
              disabled={disabled}
              aria-label={`Delete deployment preset ${preset.name}`}
              onClick={() =>
                persist(
                  presets.filter((p) => p.name !== preset.name),
                  'Preset deleted.',
                )
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
