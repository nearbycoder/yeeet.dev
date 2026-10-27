// The runtime, CLI, and control plane share one definition of a site backend.
export {
  BACKEND_DIRECTORY,
  BACKEND_ENTRIES,
  BACKEND_ROUTE_PREFIX,
  BackendLayoutError,
  MAX_BACKEND_BYTES,
  MAX_BACKEND_FILES,
  MAX_MIGRATIONS,
  MAX_MIGRATION_BYTES,
  MIGRATIONS_DIRECTORY,
  MIGRATION_NAME,
  compareMigrationNames,
  describeBackend,
  isBackendRoute,
  isPrivateBackendPath,
} from '../../packages/runtime/src/backend-layout.js'
