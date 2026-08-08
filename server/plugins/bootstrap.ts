import { ensureInitialCredentials, cleanExpiredSessions } from '../utils/auth'
import { getDatabase } from '../utils/db'

export default defineNitroPlugin(async () => {
  getDatabase()
  await ensureInitialCredentials()
  cleanExpiredSessions()
})
