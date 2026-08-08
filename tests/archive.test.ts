import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { ArchiveError, extractUpload } from '../server/utils/archive'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'slidev-vault-archive-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('upload extraction', () => {
  it('wraps a Markdown upload as slides.md', async () => {
    const destination = await temporaryDirectory()
    await extractUpload(Buffer.from('# Hello'), 'deck.md', destination)
    await expect(readFile(resolve(destination, 'slides.md'), 'utf8')).resolves.toBe('# Hello')
  })

  it('extracts a Slidev bundle with components and public assets', async () => {
    const destination = await temporaryDirectory()
    const archive = zipSync({
      'slides.md': strToU8('# Bundle'),
      'components/Counter.vue': strToU8('<template><div>1</div></template>'),
      'public/images/logo.txt': strToU8('asset'),
    })
    await extractUpload(Buffer.from(archive), 'deck.zip', destination)
    await expect(readFile(resolve(destination, 'components/Counter.vue'), 'utf8')).resolves.toContain('template')
    await expect(readFile(resolve(destination, 'public/images/logo.txt'), 'utf8')).resolves.toBe('asset')
  })

  it('rejects path traversal and missing slides.md', async () => {
    const destination = await temporaryDirectory()
    const traversal = zipSync({ '../escape.md': strToU8('no') })
    await expect(extractUpload(Buffer.from(traversal), 'bad.zip', destination)).rejects.toBeInstanceOf(ArchiveError)

    const missing = zipSync({ 'README.md': strToU8('no slides') })
    await expect(extractUpload(Buffer.from(missing), 'missing.zip', destination)).rejects.toBeInstanceOf(ArchiveError)
  })

  it('rejects package-manager configuration that could execute during install', async () => {
    const destination = await temporaryDirectory()
    const archive = zipSync({
      'slides.md': strToU8('# Slides'),
      '.pnpmfile.cjs': strToU8('throw new Error("executed")'),
    })
    await expect(extractUpload(Buffer.from(archive), 'config.zip', destination)).rejects.toBeInstanceOf(ArchiveError)
  })
})
