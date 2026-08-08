import { syncBuildExchange } from '../utils/build-exchange'

export default defineNitroPlugin(async (nitroApp) => {
  await syncBuildExchange()
  const timer = setInterval(() => {
    syncBuildExchange().catch(error => console.error(JSON.stringify({
      level: 'error',
      event: 'build_exchange.sync_failed',
      error: error instanceof Error ? error.message : String(error),
    })))
  }, 2_000)
  timer.unref()
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
