<script setup lang="ts">
import { apiErrorMessage } from '../utils/api-error'

useHead({ title: '管理登录 · Slidev Vault' })
const password = ref('')
const pending = ref(false)
const errorMessage = ref('')

async function login() {
  if (pending.value) return
  pending.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/admin/login', {
      method: 'POST',
      body: { password: password.value },
    })
    await navigateTo('/')
  }
  catch (error) {
    errorMessage.value = apiErrorMessage(error, '无法登录')
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <main class="auth-panel" aria-labelledby="login-title">
      <p class="eyebrow">Slidev / Vault</p>
      <h1 id="login-title">管理控制台</h1>
      <p class="auth-lead">上传项目、观察构建、控制访问。管理凭据与展示密码彼此独立。</p>

      <form class="auth-form" @submit.prevent="login">
        <label for="admin-password">管理密码</label>
        <input
          id="admin-password"
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          autofocus
        >
        <p v-if="errorMessage" class="form-message message-error" role="alert">{{ errorMessage }}</p>
        <button class="button button-primary" type="submit" :disabled="pending">
          {{ pending ? '正在验证…' : '进入控制台' }}
        </button>
      </form>
      <p class="auth-footnote">会话只保存在安全的 HttpOnly Cookie 中。</p>
    </main>
  </div>
</template>
