import { access, cp, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { closeDatabase } from '../server/utils/db'
import { getDataPaths, getServerConfig } from '../server/utils/config'

const sourceArg = process.argv[2]
const confirmed = process.argv.includes('--confirm')
if (!sourceArg || !confirmed) {
  throw new Error('用法：pnpm restore -- <backup-directory> --confirm（恢复前必须停止 app 与 worker）')
}

const source = resolve(sourceArg)
const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8')) as { app?: string, format?: number }
if (manifest.app !== 'slidev-vault' || manifest.format !== 1) throw new Error('备份清单不兼容')
await access(resolve(source, 'slidev-vault.db'))

const config = getServerConfig()
const paths = getDataPaths()
const dataRoot = `${resolve(config.dataDir)}${sep}`
const rollbackRoot = resolve(config.dataDir, `restore-rollback-${new Date().toISOString().replace(/[:.]/g, '-')}`)
if (!rollbackRoot.startsWith(dataRoot)) throw new Error('恢复目录越界')

closeDatabase()
await mkdir(rollbackRoot, { recursive: true })

for (const item of [
  config.databasePath,
  `${config.databasePath}-wal`,
  `${config.databasePath}-shm`,
  paths.sources,
  paths.published,
  paths.logs,
]) {
  await rename(item, resolve(rollbackRoot, item.startsWith(config.databasePath) ? item.slice(dirname(config.databasePath).length + 1) : item.slice(dataRoot.length)))
    .catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    })
}

await cp(resolve(source, 'slidev-vault.db'), config.databasePath)
for (const name of ['sources', 'published', 'logs'] as const) {
  await cp(resolve(source, name), paths[name], { recursive: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  })
}
await rm(paths.work, { recursive: true, force: true })
console.log(`恢复完成。原数据保留在 ${rollbackRoot}`)
