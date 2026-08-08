import { resolve } from 'node:path'

export type AuthKind = 'admin' | 'viewer'

function integerFromEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function getServerConfig() {
  const dataDir = resolve(process.env.NUXT_DATA_DIR || process.env.DATA_DIR || './data')

  return {
    dataDir,
    databasePath: resolve(dataDir, 'slidev-vault.db'),
    adminHost: (process.env.NUXT_ADMIN_HOST || '').toLowerCase(),
    slidesHost: (process.env.NUXT_SLIDES_HOST || '').toLowerCase(),
    cookieSecure: process.env.NUXT_COOKIE_SECURE
      ? process.env.NUXT_COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production',
    initialAdminPassword: process.env.NUXT_INITIAL_ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || '',
    initialViewerPassword: process.env.NUXT_INITIAL_VIEWER_PASSWORD || process.env.INITIAL_VIEWER_PASSWORD || '',
    maxUploadBytes: integerFromEnv('MAX_UPLOAD_BYTES', 25 * 1024 * 1024),
    maxExtractedBytes: integerFromEnv('MAX_EXTRACTED_BYTES', 100 * 1024 * 1024),
    maxArchiveFiles: integerFromEnv('MAX_ARCHIVE_FILES', 500),
    buildTimeoutMs: integerFromEnv('BUILD_TIMEOUT_MS', 5 * 60 * 1000),
    adminSessionSeconds: integerFromEnv('ADMIN_SESSION_SECONDS', 12 * 60 * 60),
    viewerSessionSeconds: integerFromEnv('VIEWER_SESSION_SECONDS', 7 * 24 * 60 * 60),
  }
}

export function getDataPaths() {
  const { dataDir } = getServerConfig()
  return {
    root: dataDir,
    sources: resolve(dataDir, 'sources'),
    published: resolve(dataDir, 'published'),
    work: resolve(dataDir, 'work'),
    logs: resolve(dataDir, 'logs'),
    backups: resolve(dataDir, 'backups'),
  }
}

export function getBuildExchangeConfig() {
  const dataDir = getServerConfig().dataDir
  return {
    exchangeRoot: resolve(process.env.NUXT_BUILD_EXCHANGE_DIR || process.env.BUILD_EXCHANGE_DIR || resolve(dataDir, 'exchange')),
    pnpmStore: resolve(process.env.PNPM_STORE_DIR || resolve(dataDir, 'pnpm-store')),
  }
}

export function expectedHost(kind: AuthKind): string {
  const config = getServerConfig()
  return kind === 'admin' ? config.adminHost : config.slidesHost
}
