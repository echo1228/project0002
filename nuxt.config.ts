export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  modules: [],
  ssr: false,
  typescript: {
    strict: true,
    typeCheck: true,
  },
  runtimeConfig: {
    public: {
      adminOrigin: 'http://admin.localhost:3000',
      slidesOrigin: 'http://slides.localhost:3000',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'Slidev Vault',
      meta: [
        { name: 'description', content: '自托管的 Slidev 项目展示平台' },
        { name: 'color-scheme', content: 'dark' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
  nitro: {
    compressPublicAssets: true,
  },
})
