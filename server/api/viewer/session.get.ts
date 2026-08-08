import { hasSession } from '../../utils/auth'
import { assertHost } from '../../utils/http'

export default defineEventHandler((event) => {
  assertHost(event, 'viewer')
  return { authenticated: hasSession(event, 'viewer') }
})
