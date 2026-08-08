import { cp, mkdir, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { getDataPaths, getServerConfig } from '../server/utils/config'

const paths = getDataPaths()
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const destination = resolve(process.argv[2] || resolve(paths.backups, timestamp))

if (destination === resolve(getServerConfig().dataDir)) throw new Error('备份目录不能是数据根目录')
await mkdir(destination, { recursive: true })

const sourceDb = new Database(getServerConfig().databasePath, { readonly: true })
try {
  await sourceDb.backup(resolve(destination, 'slidev-vault.db'))
}
finally {
  sourceDb.close()
}

for (const name of ['sources', 'published', 'logs'] as const) {
  await cp(paths[name], resolve(destination, name), { recursive: true, force: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  })
}

await writeFile(resolve(destination, 'manifest.json'), `${JSON.stringify({
  format: 1,
  app: 'slidev-vault',
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  directory: basename(destination),
}, null, 2)}\n`)

console.log(destination)
