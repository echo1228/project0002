export type BuildStatus = 'pending' | 'building' | 'ready' | 'failed'

export interface DeckRevisionSummary {
  id: string
  status: BuildStatus
  createdAt: string
  completedAt: string | null
  error: string | null
}

export interface DeckSummary {
  id: string
  slug: string
  title: string
  createdAt: string
  updatedAt: string
  activeRevisionId: string | null
  latestRevision: DeckRevisionSummary | null
}

export interface SystemSummary {
  version: string
  workerOnline: boolean
  workerLastSeenAt: string | null
  queuedJobs: number
  buildingJobs: number
}

export interface ApiErrorBody {
  statusCode?: number
  statusMessage?: string
  data?: {
    code?: string
    message?: string
  }
}
