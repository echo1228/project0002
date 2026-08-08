<script setup lang="ts">
import { apiErrorMessage } from '../utils/api-error'

useHead({ title: '访问验证 · Slidev Vault' })
const route = useRoute()
const password = ref('')
const pending = ref(false)
const errorMessage = ref('')
const next = computed(() => typeof route.query.next === 'string' ? route.query.next : '/')

async function unlock() {
  if (pending.value) return
  pending.value = true
  errorMessage.value = ''
  try {
    const result = await $fetch<{ next: string }>('/api/viewer/login', {
      method: 'POST',
      body: { password: password.value, next: next.value },
    })
    window.location.assign(result.next)
  }
  catch (error) {
    errorMessage.value = apiErrorMessage(error, '无法验证访问密码')
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="auth-page viewer-auth-page">
    <main class="auth-panel" aria-labelledby="unlock-title">
      <div class="vault-mark" aria-hidden="true"><span>V</span></div>
      <p class="eyebrow">Private presentation</p>
      <h1 id="unlock-title">这份内容需要密码</h1>
      <p class="auth-lead">输入展示访问密码后，本浏览器将在有效期内保持登录。</p>

      <form class="auth-form" @submit.prevent="unlock">
        <label for="viewer-password">访问密码</label>
        <input
          id="viewer-password"
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          autofocus
        >
        <p v-if="errorMessage" class="form-message message-error" role="alert">{{ errorMessage }}</p>
        <button class="button button-primary" type="submit" :disabled="pending">
          {{ pending ? '正在开启…' : '开启幻灯片' }}
        </button>
      </form>
    </main>
  </div>
</template>
