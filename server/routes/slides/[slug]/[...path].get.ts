import { serveDeck } from '../../../utils/serve-deck'

export default defineEventHandler(event => serveDeck(
  event,
  getRouterParam(event, 'slug') || '',
  getRouterParam(event, 'path') || '',
))
