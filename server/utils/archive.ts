import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import yauzl from 'yauzl'
import { getServerConfig } from './config'

export class ArchiveError extends Error {}

export function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function extractUpload(buffer: Buffer, filename: string, destination: string): Promise<void> {
  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  try {
    if (filename.toLowerCase().endsWith('.md')) {
      await writeFile(resolve(destination, 'slides.md'), buffer, { flag: 'wx' })
    }
    else if (filename.toLowerCase().endsWith('.zip')) {
      await extractZip(buffer, destination)
    }
    else {
      throw new ArchiveError('仅支持 .md 或 .zip 文件')
    }

    const slidesPath = resolve(destination, 'slides.md')
    const root = `${resolve(destination)}${sep}`
    if (!slidesPath.startsWith(root)) throw new ArchiveError('无效的项目路径')
    await import('node:fs/promises').then(fs => fs.access(slidesPath))
  }
  catch (error) {
    await rm(destination, { recursive: true, force: true })
    if (error instanceof ArchiveError) throw error
    throw new ArchiveError(error instanceof Error ? error.message : '无法读取上传文件')
  }
}

function validateEntryName(name: string): string {
  if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw new ArchiveError(`ZIP 包含无效路径：${name}`)
  }
  const segments = name.split('/').filter(Boolean)
  const lowered = segments.map(part => part.toLowerCase())
  if (lowered.some(part => part === '..' || part === '.' || part === '.git' || part === 'node_modules')) {
    throw new ArchiveError(`ZIP 包含禁止路径：${name}`)
  }
  if (lowered.some(part => part === '.env' || part.startsWith('.env.'))) {
    throw new ArchiveError(`ZIP 不允许包含环境变量文件：${name}`)
  }
  const dangerousConfig = new Set(['.npmrc', '.pnpmfile.cjs', 'pnpmfile.cjs', 'pnpm-workspace.yaml', 'pnpm-workspace.yml', '.yarnrc', '.yarnrc.yml'])
  if (lowered.some(part => dangerousConfig.has(part))) {
    throw new ArchiveError(`ZIP 不允许覆盖包管理器配置：${name}`)
  }
  return segments.join('/')
}

async function extractZip(buffer: Buffer, destination: string): Promise<void> {
  const config = getServerConfig()
  const root = `${resolve(destination)}${sep}`
  const zip = await new Promise<yauzl.ZipFile>((resolveZip, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: true, strictFileNames: true }, (error, file) => {
      if (error || !file) reject(error || new ArchiveError('无法打开 ZIP 文件'))
      else resolveZip(file)
    })
  })

  let fileCount = 0
  let declaredBytes = 0
  let writtenBytes = 0

  await new Promise<void>((resolveDone, rejectDone) => {
    const fail = (error: unknown) => {
      zip.close()
      rejectDone(error)
    }

    zip.on('error', fail)
    zip.on('end', resolveDone)
    zip.on('entry', async (entry: yauzl.Entry) => {
      try {
        const relative = validateEntryName(entry.fileName)
        if (!relative) {
          zip.readEntry()
          return
        }

        const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff
        if ((unixMode & 0o170000) === 0o120000) throw new ArchiveError(`不允许符号链接：${entry.fileName}`)

        const isDirectory = entry.fileName.endsWith('/')
        const target = resolve(destination, relative)
        if (target !== resolve(destination) && !target.startsWith(root)) {
          throw new ArchiveError(`ZIP 路径越界：${entry.fileName}`)
        }

        if (isDirectory) {
          await mkdir(target, { recursive: true })
          zip.readEntry()
          return
        }

        fileCount += 1
        declaredBytes += entry.uncompressedSize
        if (fileCount > config.maxArchiveFiles) throw new ArchiveError(`ZIP 文件数量超过 ${config.maxArchiveFiles}`)
        if (declaredBytes > config.maxExtractedBytes) throw new ArchiveError('ZIP 解压后体积超过限制')

        await mkdir(dirname(target), { recursive: true })
        const stream = await new Promise<NodeJS.ReadableStream>((resolveStream, rejectStream) => {
          zip.openReadStream(entry, (error, readStream) => {
            if (error || !readStream) rejectStream(error || new ArchiveError('无法读取 ZIP 条目'))
            else resolveStream(readStream)
          })
        })
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            writtenBytes += chunk.length
            if (writtenBytes > config.maxExtractedBytes) callback(new ArchiveError('ZIP 实际解压体积超过限制'))
            else callback(null, chunk)
          },
        })
        await pipeline(stream, limiter, createWriteStream(target, { flags: 'wx', mode: 0o640 }))
        zip.readEntry()
      }
      catch (error) {
        fail(error)
      }
    })
    zip.readEntry()
  })
}
