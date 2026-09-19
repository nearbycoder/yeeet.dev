import assert from 'node:assert/strict'
import test from 'node:test'
import {
  saveDeploymentPreset,
  deploymentPresetsSchema,
} from '../src/lib/deployment-presets'

const settings = {
  slug: 'demo',
  channel: 'staging',
  spaFallback: true,
  privateDeploy: true,
}
test('presets strip passwords and unknown data, replace names, and cap records', () => {
  const first = saveDeploymentPreset([], ' Example ', {
    ...settings,
    deployPassword: 'secret',
    files: ['secret'],
  })
  assert.deepEqual(first, [{ name: 'Example', settings }])
  assert.equal(
    saveDeploymentPreset(first, 'example', { ...settings, slug: 'new' })[0]
      .settings.slug,
    'new',
  )
  assert.throws(() => saveDeploymentPreset([], '', settings))
  assert.equal(
    deploymentPresetsSchema.safeParse([
      { name: 'bad', settings: { ...settings, slug: 'https://evil' } },
    ]).success,
    false,
  )
  const full = Array.from({ length: 12 }, (_, i) => ({
    name: String(i),
    settings,
  }))
  assert.throws(() => saveDeploymentPreset(full, 'extra', settings))
})
