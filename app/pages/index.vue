<script setup lang="ts">
import type { DeckSummary, SystemSummary } from '../../shared/types'
import { apiErrorMessage, apiStatusCode } from '../utils/api-error'

useHead({ title: 'Slidev Vault · 控制台' })
const config = useRuntimeConfig()
const decks = ref<DeckSummary[]>([])
const system = ref<SystemSummary | null>(null)
const loading = ref(true)
const uploadPending = ref(false)
const uploadFile = ref<File | null>(null)
const uploadInput = ref<HTMLInputElement | null>(null)
const title = ref('')
const slug = ref('')
const pageMessage = ref<{ type: 'success' | 'error', text: string } | null>(null)
const logsOpen = ref(false)
const logTitle = ref('')
const logContent = ref('')
const viewerPassword = ref('')
const viewerPasswordConfirm = ref('')
const currentAdminPassword = ref('')
const newAdminPassword = ref('')
const adminPasswordConfirm = ref('')
let timer: ReturnType<typeof setInterval> | undefined

function suggestedSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

function chooseFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] || null
  uploadFile.value = file
  if (!file) return
  const base = file.name.replace(/\.(md|zip)$/i, '')
  if (!title.value) title.value = base
  if (!slug.value) slug.value = suggestedSlug(base)
}

async function loadDashboard(showSpinner = false) {
  if (showSpinner) loading.value = true
  try {
    const [deckResult, systemResult] = await Promise.all([
      $fetch<{ decks: DeckSummary[] }>('/api/admin/decks'),
      $fetch<SystemSummary>('/api/admin/system'),
    ])
    decks.value = deckResult.decks
    system.value = systemResult
  }
  catch (error) {
    if (apiStatusCode(error) === 401) {
      await navigateTo('/login')
      return
    }
    pageMessage.value = { type: 'error', text: apiErrorMessage(error, '无法加载控制台') }
  }
  finally {
    loading.value = false
  }
}

async function uploadDeck() {
  if (!uploadFile.value || uploadPending.value) return
  uploadPending.value = true
  pageMessage.value = null
  const form = new FormData()
  form.append('file', uploadFile.value)
  form.append('title', title.value)
  form.append('slug', slug.value)
  try {
    await $fetch('/api/admin/decks', { method: 'POST', body: form })
    pageMessage.value = { type: 'success', text: '已进入构建队列；旧版本会保持在线，直到新版本成功。' }
    uploadFile.value = null
    title.value = ''
    slug.value = ''
    if (uploadInput.value) uploadInput.value.value = ''
    await loadDashboard()
  }
  catch (error) {
    pageMessage.value = { type: 'error', text: apiErrorMessage(error, '上传失败') }
  }
  finally {
    uploadPending.value = false
  }
}

async function rebuild(deck: DeckSummary) {
  pageMessage.value = null
  try {
    await $fetch(`/api/admin/decks/${deck.id}/rebuild`, { method: 'POST' })
    pageMessage.value = { type: 'success', text: `“${deck.title}”已进入重建队列。` }
    await loadDashboard()
  }
  catch (error) {
    pageMessage.value = { type: 'error', text: apiErrorMessage(error, '无法重建') }
  }
}

async function removeDeck(deck: DeckSummary) {
  if (!window.confirm(`确定永久删除“${deck.title}”及其全部版本吗？`)) return
  try {
    await $fetch(`/api/admin/decks/${deck.id}`, { method: 'DELETE' })
    pageMessage.value = { type: 'success', text: `已删除“${deck.title}”。` }
    await loadDashboard()
  }
  catch (error) {
    pageMessage.value = { type: 'error', text: apiErrorMessage(error, '无法删除') }
  }
}

async function showLogs(deck: DeckSummary) {
  logsOpen.value = true
  logTitle.value = `${deck.title} · 构建日志`
  logContent.value = '正在读取…'
  try {
    const result = await $fetch<{ log: string }>(`/api/admin/decks/${deck.id}/logs`)
    logContent.value = result.log
  }
  catch (error) {
    logContent.value = apiErrorMessage(error, '无法读取日志')
  }
}

async function changeViewerPassword() {
  if (viewerPassword.value !== viewerPasswordConfirm.value) {
    pageMessage.value = { type: 'error', text: '两次输入的展示密码不一致。' }
    return
  }
  try {
    await $fetch('/api/admin/viewer-password', { method: 'PUT', body: { password: viewerPassword.value } })
    viewerPassword.value = ''
    viewerPasswordConfirm.value = ''
    pageMessage.value = { type: 'success', text: '展示密码已更新，所有旧访问会话已失效。' }
  }
  catch (error) {
    pageMessage.value = { type: 'error', text: apiErrorMessage(error, '无法修改展示密码') }
  }
}

async function changeAdminPassword() {
  if (newAdminPassword.value !== adminPasswordConfirm.value) {
    pageMessage.value = { type: 'error', text: '两次输入的新管理密码不一致。' }
    return
  }
  try {
    await $fetch('/api/admin/password', {
      method: 'PUT',
      body: { currentPassword: currentAdminPassword.value, newPassword: newAdminPassword.value },
    })
    pageMessage.value = { type: 'success', text: '管理密码已更新，请重新登录。' }
    await navigateTo('/login')
  }
  catch (error) {
    pageMessage.value = { type: 'error', text: apiErrorMessage(error, '无法修改管理密码') }
  }
}

async function logout() {
  await $fetch('/api/admin/logout', { method: 'POST' }).catch(() => undefined)
  await navigateTo('/login')
}

function viewerUrl(deck: DeckSummary): string {
  return `${String(config.public.slidesOrigin).replace(/\/$/, '')}/slides/${deck.slug}/`
}

function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

onMounted(async () => {
  await loadDashboard(true)
  timer = setInterval(() => loadDashboard(), 4_000)
})
onBeforeUnmount(() => timer && clearInterval(timer))
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="dashboard-shell">
    <header class="topbar">
      <a class="wordmark" href="/" aria-label="Slidev Vault 首页">
        <span class="wordmark-index">01</span>
        <span>Slidev<br>Vault</span>
      </a>
      <div class="system-cluster" aria-live="polite">
        <span class="system-state" :class="{ online: system?.workerOnline }">
          <span class="status-dot" />
          Worker {{ system?.workerOnline ? '在线' : '离线' }}
        </span>
        <span class="system-meta">队列 {{ system?.queuedJobs ?? '—' }}</span>
        <button class="button button-quiet" type="button" @click="logout">退出</button>
      </div>
    </header>

    <main id="main-content" class="dashboard-main">
      <section class="intro-grid" aria-labelledby="page-title">
        <div>
          <p class="eyebrow">Private presentation operations</p>
          <h1 id="page-title">让内容上线，<br><em>让构建留在沙箱。</em></h1>
        </div>
        <p class="intro-copy">上传 Markdown，或包含组件、主题与本地资源的完整 ZIP。新版本构建成功后才会切换，展示链接始终受统一密码保护。</p>
      </section>

      <p v-if="pageMessage" class="page-message" :class="`message-${pageMessage.type}`" role="status">
        {{ pageMessage.text }}
      </p>

      <div class="workspace-grid">
        <section class="primary-column" aria-labelledby="deck-heading">
          <div class="section-heading">
            <div>
              <p class="section-index">A / Library</p>
              <h2 id="deck-heading">幻灯片库</h2>
            </div>
            <span class="count-mark">{{ decks.length.toString().padStart(2, '0') }}</span>
          </div>

          <div v-if="loading" class="empty-state">正在读取版本库…</div>
          <div v-else-if="decks.length === 0" class="empty-state">
            <strong>这里还没有内容。</strong>
            <span>从右侧上传第一份 slides.md 或 Slidev 项目 ZIP。</span>
          </div>
          <div v-else class="deck-list">
            <article v-for="(deck, index) in decks" :key="deck.id" class="deck-card">
              <div class="deck-spine"><span>{{ String(index + 1).padStart(2, '0') }}</span></div>
              <div class="deck-body">
                <div class="deck-title-row">
                  <div>
                    <h3>{{ deck.title }}</h3>
                    <code>/slides/{{ deck.slug }}/</code>
                  </div>
                  <StatusBadge v-if="deck.latestRevision" :status="deck.latestRevision.status" />
                </div>
                <p v-if="deck.latestRevision?.error" class="deck-error">{{ deck.latestRevision.error }}</p>
                <div class="deck-footer">
                  <span>更新于 {{ formatTime(deck.updatedAt) }}</span>
                  <div class="deck-actions">
                    <a
                      v-if="deck.activeRevisionId"
                      class="button button-secondary"
                      :href="viewerUrl(deck)"
                      target="_blank"
                      rel="noopener"
                    >打开</a>
                    <button class="button button-quiet" type="button" @click="showLogs(deck)">日志</button>
                    <button class="button button-quiet" type="button" @click="rebuild(deck)">重建</button>
                    <button class="button button-danger" type="button" @click="removeDeck(deck)">删除</button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <aside class="control-column" aria-label="上传与设置">
          <section class="control-card upload-card" aria-labelledby="upload-heading">
            <p class="section-index">B / Publish</p>
            <h2 id="upload-heading">上传新版本</h2>
            <form class="stack-form" @submit.prevent="uploadDeck">
              <label class="drop-field" for="deck-file">
                <input
                  id="deck-file"
                  ref="uploadInput"
                  type="file"
                  accept=".md,.zip,text/markdown,application/zip"
                  required
                  @change="chooseFile"
                >
                <span class="drop-plus" aria-hidden="true">＋</span>
                <strong>{{ uploadFile?.name || '选择 .md 或 .zip' }}</strong>
                <small>最大 25 MiB；ZIP 根目录需包含 slides.md</small>
              </label>
              <label for="deck-title">标题</label>
              <input id="deck-title" v-model="title" maxlength="100" required placeholder="季度复盘">
              <label for="deck-slug">短链接</label>
              <div class="slug-field"><span>/slides/</span><input id="deck-slug" v-model="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required placeholder="quarterly-review"><span>/</span></div>
              <button class="button button-primary" type="submit" :disabled="uploadPending || !uploadFile">
                {{ uploadPending ? '正在接收…' : '上传并构建' }}
              </button>
            </form>
          </section>

          <section class="control-card" aria-labelledby="viewer-password-heading">
            <p class="section-index">C / Access</p>
            <h2 id="viewer-password-heading">展示访问密码</h2>
            <p class="control-note">修改后，所有已登录的展示浏览器会立即退出。</p>
            <form class="stack-form compact-form" @submit.prevent="changeViewerPassword">
              <label for="viewer-new-password">新密码</label>
              <input id="viewer-new-password" v-model="viewerPassword" type="password" minlength="12" autocomplete="new-password" required>
              <label for="viewer-confirm-password">确认新密码</label>
              <input id="viewer-confirm-password" v-model="viewerPasswordConfirm" type="password" minlength="12" autocomplete="new-password" required>
              <button class="button button-secondary" type="submit">更新展示密码</button>
            </form>
          </section>

          <details class="control-card admin-details">
            <summary>修改管理密码</summary>
            <form class="stack-form compact-form" @submit.prevent="changeAdminPassword">
              <label for="admin-current-password">当前密码</label>
              <input id="admin-current-password" v-model="currentAdminPassword" type="password" autocomplete="current-password" required>
              <label for="admin-new-password">新密码</label>
              <input id="admin-new-password" v-model="newAdminPassword" type="password" minlength="14" autocomplete="new-password" required>
              <label for="admin-confirm-password">确认新密码</label>
              <input id="admin-confirm-password" v-model="adminPasswordConfirm" type="password" minlength="14" autocomplete="new-password" required>
              <button class="button button-secondary" type="submit">更新并重新登录</button>
            </form>
          </details>
        </aside>
      </div>
    </main>
  </div>

  <div v-if="logsOpen" class="dialog-backdrop" @click.self="logsOpen = false">
    <section class="log-dialog" role="dialog" aria-modal="true" aria-labelledby="log-title">
      <header><h2 id="log-title">{{ logTitle }}</h2><button class="button button-quiet" type="button" @click="logsOpen = false">关闭</button></header>
      <pre tabindex="0">{{ logContent }}</pre>
    </section>
  </div>
</template>
