import type { SystemSummary } from '../../../shared/types'
import { requireSession } from '../../utils/auth'
import { getDatabase } from '../../utils/db'
import { assertHost } from '../../utils/http'
import { getWorkerHeartbeat } from '../../utils/build-exchange'

export default defineEventHandler(async (event): Promise<SystemSummary> => {
  assertHost(event, 'admin')
  requireSession(event, 'admin')
  const db = getDatabase()
  const heartbeat = await getWorkerHeartbeat()
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status = 'building' THEN 1 ELSE 0 END) AS building
    FROM build_jobs
  `).get() as { queued: number | null, building: number | null }
  const online = heartbeat?.lastSeenAt
    ? Date.now() - new Date(heartbeat.lastSeenAt).getTime() < 30_000
    : false
  return {
    version: '1.0.0',
    workerOnline: online,
    workerLastSeenAt: heartbeat?.lastSeenAt || null,
    queuedJobs: counts.queued || 0,
    buildingJobs: counts.building || 0,
  }
})
