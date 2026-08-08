<script setup lang="ts">
import type { BuildStatus } from '../../shared/types'

defineProps<{ status: BuildStatus }>()

const labels: Record<BuildStatus, string> = {
  pending: '等待构建',
  building: '构建中',
  ready: '可访问',
  failed: '构建失败',
}
</script>

<template>
  <span class="status-badge" :class="`status-${status}`">
    <span class="status-dot" aria-hidden="true" />
    {{ labels[status] }}
  </span>
</template>
