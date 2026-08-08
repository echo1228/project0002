import { getDatabase } from '../utils/db'

export default defineEventHandler(() => {
  getDatabase().prepare('SELECT 1').get()
  return { ok: true }
})
