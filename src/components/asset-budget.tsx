import {
  budgetPreferencesSchema,
  budgetStorageKey,
  defaultBudgetPreferences,
} from '#/lib/budget-preferences'
import { useEffect, useMemo, useState } from 'react'
import { assetBudget } from '#/lib/asset-budget'
import type { ManifestFile } from '#/lib/file-explorer'
import { formatNumber } from '#/lib/format'

export function AssetBudget({
  files,
  userId,
  slug,
}: {
  files: Array<ManifestFile>
  userId: string
  slug: string
}) {
  const [fileKiBInput, setFileKiBInput] = useState('512')
  const [totalMiBInput, setTotalMiBInput] = useState('10')
  const [notice, setNotice] = useState('')
  const storageKey = budgetStorageKey(userId, slug)
  useEffect(() => {
    try {
      const saved = budgetPreferencesSchema.parse(
        JSON.parse(
          localStorage.getItem(storageKey) ??
            JSON.stringify(defaultBudgetPreferences),
        ),
      )
      setFileKiBInput(String(saved.fileKiB))
      setTotalMiBInput(String(saved.totalMiB))
    } catch {
      setFileKiBInput('512')
      setTotalMiBInput('10')
      setNotice('Saved budgets could not be loaded. Defaults are shown.')
    }
  }, [storageKey])
  const parsedFileKiB = Math.max(
    1,
    Math.min(1048576, Math.round(Number(fileKiBInput)) || 512),
  )
  const parsedTotalMiB = Math.max(
    1,
    Math.min(1048576, Math.round(Number(totalMiBInput)) || 10),
  )
  const report = useMemo(
    () => assetBudget(files, parsedFileKiB, parsedTotalMiB),
    [files, parsedFileKiB, parsedTotalMiB],
  )
  return (
    <details className="console-item">
      <summary>Asset budget review</summary>
      <p>
        Review uncompressed stored bytes. These thresholds do not block
        publishing. Save them for this site and account in this browser.
      </p>
      <div className="console-form-grid">
        <label>
          Per-file budget (KiB)
          <input
            name="asset-file-budget"
            type="number"
            min={1}
            max={1048576}
            value={fileKiBInput}
            onChange={(event) => setFileKiBInput(event.target.value)}
          />
        </label>
        <label>
          Total budget (MiB)
          <input
            name="asset-total-budget"
            type="number"
            min={1}
            max={1048576}
            value={totalMiBInput}
            onChange={(event) => setTotalMiBInput(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button button-paper"
          onClick={() => {
            try {
              const preferences = budgetPreferencesSchema.parse({
                fileKiB: Number(fileKiBInput),
                totalMiB: Number(totalMiBInput),
              })
              localStorage.setItem(storageKey, JSON.stringify(preferences))
              setFileKiBInput(String(preferences.fileKiB))
              setTotalMiBInput(String(preferences.totalMiB))
              setNotice('Budgets saved for this site.')
            } catch {
              setNotice(
                'Could not save budgets. Use whole numbers within the allowed range and enable browser storage.',
              )
            }
          }}
        >
          Save site budgets
        </button>
        <button
          type="button"
          className="button button-paper"
          onClick={() => {
            try {
              localStorage.removeItem(storageKey)
              setFileKiBInput('512')
              setTotalMiBInput('10')
              setNotice('Saved budgets cleared. Defaults restored.')
            } catch {
              setNotice(
                'Browser storage is unavailable. Saved budgets were not changed.',
              )
            }
          }}
        >
          Reset budgets
        </button>
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      <p role="status">
        {report.overFiles.length} files exceed the file budget.{' '}
        {report.overTotal
          ? `${formatNumber(report.overTotal)} bytes over the total budget.`
          : 'Within the total budget.'}
      </p>
      <ul>
        {report.byType.map(([kind, bytes]) => (
          <li key={kind}>
            {kind}: {formatNumber(bytes)} bytes (
            {report.total ? Math.round((bytes / report.total) * 100) : 0}%)
          </li>
        ))}
      </ul>
      <h4>Ten largest files</h4>
      {report.largest.length ? (
        <ol>
          {report.largest.map((file) => (
            <li key={file.path}>
              <code>{file.path}</code> · {formatNumber(file.size)} bytes
              {file.size > report.fileLimit ? ' · Over budget' : ''}
            </li>
          ))}
        </ol>
      ) : (
        <p>This version contains no files.</p>
      )}
    </details>
  )
}
