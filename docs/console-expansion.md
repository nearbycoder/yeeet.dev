# Console additions

This update adds 20 capabilities using the existing console, authentication, and
deployment records. The numbered list is the feature inventory for review.

1. **Quick commands.** Ctrl/⌘ K searches Dashboard, Workspaces, Storage, and
   Integrations alongside owned sites. Commands match their name and description.
2. **Keyboard navigation in the switcher.** Up/Down cycles through visible links;
   Enter in search opens the first result. Escape closes and restores focus.
3. **Fleet CSV export.** Export the displayed fleet page, including live version,
   organization, tags, custom domains, sizes, and access mode. Other pages and
   private share tokens are excluded.
4. **Release comparison selection.** In Versions, choose a baseline and target,
   including across history pages. Swap their order and open the inspector with
   both exact IDs. Selection is scoped to the current site.
5. **Release history CSV.** Export the displayed history page with full version
   IDs, labels, notes, timestamps, sizes, live state, and retention pins.
6. **Folder browsing.** Inspect filters the manifest by any directory, including
   descendants. Directory boundaries distinguish `assets/` from `assets-old/`.
7. **File size ranges.** Combine minimum/maximum KiB with path, type, and sorting.
   Boundaries are inclusive; zero matches empty files. Folder and size filters
   are included by Bookmark these file filters.
8. **Bulk file selection.** Select files individually or all matches, retain
   selections while filtering/paging, copy selected paths, or export selected CSV.
   Selection is temporary and resets when the inspector reloads or changes version.
9. **Copy file metadata.** File Actions copies the path, full recorded SHA-256,
   or exact immutable version file URL. URLs contain no private share token.
10. **Asset composition.** Inspect groups uncompressed manifest bytes by top-level
    folder or content type, displays byte shares, and exports every group as CSV.
    Lists start at 20 groups and can expand. This is not physical storage billing.
11. **Deployed-file safety review.** Inspect flags potentially private filenames,
    source maps, dependency directories, empty files, and a missing root entry.
    Download all findings as JSON. These are advisory metadata checks, not a scan
    of contents or a security certification.
12. **Find in deployed source.** Literal, case-insensitive text search highlights
    matches and provides Previous/Next with line positions. It searches the
    displayed source only, with the first 1,000 matches available for navigation.
13. **JSON formatting.** Format valid, complete JSON for reading and switch back
    to original source. Invalid JSON reports an error without losing the original.
    Truncated source cannot be formatted. Stored files never change.
14. **Source reading controls.** Wrap long lines, toggle line numbers, and copy
    displayed source. Numbers hide while wrapping or beyond 2,000 lines. Existing
    64 KiB preview limits remain; HTML/JS/SVG are displayed as text, never executed.
15. **Analytics periods.** Choose 7, 30, or 90 days; the choice persists in the URL.
16. **Previous-period analytics.** Compare request totals and error rates with the
    immediately preceding period of equal length. UTC boundaries are explicit;
    the current period includes today's partial totals. No visitor identities are
    collected. The API also returns an additive `comparison` field.
17. **Weekly traffic aggregation.** Switch the trend between daily totals and
    Monday-based UTC weeks. First/last weeks may contain partial data.
18. **Analytics exports.** Download daily totals, the top 20 normalized paths,
    and status totals as CSV, or the complete report with comparison as JSON.
19. **Upload exclusion patterns.** Advanced options → Edit upload selection previews
    root-relative, case-sensitive globs with file/byte counts before applying them.
    `*` stays within a folder, `**` crosses folders, `?` matches one character.
    `**/` also matches the build root. Use up to 30 patterns, 200 characters each;
    lines starting with `#` are comments. Files remain in the source selection.
20. **Upload selection undo/redo.** Undo or redo up to 20 changes made in the
    selection editor, including pattern exclusions and Restore all files. Selecting
    another build/folder or changing the selection elsewhere resets that history.
    Changes invalidate the previous deployment comparison; active uploads disable
    selection edits.

CSV exports use the existing formula escaping and preserve multiline notes.
Browser downloads and clipboard failures surface errors instead of success claims.
No database migrations or additional service are required for these features.

## Shared styling

The app uses a neutral light/dark surface palette with its coral and lime brand
accents. Shared radius and control-size tokens keep buttons, fields, cards, and
review panels consistent. Buttons have restrained hover states; tables use muted
headings and tabular numeric values. New tools use shared form/action patterns,
visible focus rings, responsive wrapping, and existing reduced-motion support.

Mobbin MCP was unavailable in the implementation session. The orchestrator used
the connector and relayed a visual review of the
[Braintrust playground table](https://mobbin.com/screens/b6ba8022-ce35-4276-9539-c4a59bb0507c)
and [Higgsfield editor](https://mobbin.com/screens/30f0ebff-91a8-4c11-bc28-543927bcf945).
The final review applied their relevant lessons in control grouping, quiet
separators, explicit selection/focus states, and consistent disclosure rows.
Selected file rows and release cards have a subtle surface fill. The existing
palette, routes, and responsive layout stay in place.

## Validation and review

Typecheck, ESLint, Prettier, the production build, 109 unit tests, and 22 database
integration tests passed. Both the existing browser feedback suite and the new
console browser regression passed. Integration tests used a separate local Postgres
database. Source previews used a read-only local object-storage fixture. No live
account, bucket, deployment, or database was used for validation.

The optional `tests/browser/console-tools.mjs` regression covers keyboard
navigation, exports, file selection and source authorization, comparisons across
history pages, analytics periods, mobile layouts, themes, and upload exclusions
with undo/redo. It requires an isolated local account and the console-review
fixture: 28 ready releases, nine manifest files, and a readable
`config/build.json` whose name is `review`. Run it with `YEEET_TEST_EMAIL`,
`YEEET_TEST_PASSWORD`, and optionally `YEEET_TEST_SITE` set, passing the local
app URL to `node tests/browser/console-tools.mjs`.

Browser upload validation exercises file selection, hashing, and the existing
dry-run deployment review. Storage PUTs and production publishing were not
performed because the storage fixture accepts only reads. Accessibility scans
reported no remaining violations on the reviewed dashboard, inspector, release
history, and analytics screens. Decorative glyphs and off-screen table cells
were marked for manual contrast review; light/dark screenshots were inspected.

The CI dependency audit identified an unpatched `braces` vulnerability through
`fast-glob` in the CLI and MCP packages. Both scanners now use the existing safe
`fdir`, `picomatch`, and `brace-expansion` versions. Before removing the old
dependency, 36 isolated compatibility cases produced identical file selections.
Regression tests preserve hidden files, defaults, symlink boundaries, directory
exclusions, escapes, extglobs, and numeric brace ranges, and compare both clients'
dry-run manifests against a local mock API. Excessively nested or large ignore
expansions fail before scanning or contacting the API. The npm package contents
include the replacement helper; no package version or public API changed. The
unchanged dependency audit now reports zero vulnerabilities.
