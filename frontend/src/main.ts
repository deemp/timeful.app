import { createApp } from "vue"
import { createPinia } from "pinia"
import { createHead } from "@unhead/vue/client"
import "@fontsource/chivo-mono/300.css"
import "@fontsource/chivo-mono/400.css"
import "@fontsource/chivo-mono/500.css"
import "@fontsource/dm-sans/400.css"
import "@mdi/font/css/materialdesignicons.css"
import "./index.css"
import "@/plugins/posthog"
import App from "./App.vue"
import router from "./router"
import vuetify from "./plugins/vuetify"

const app = createApp(App)

app.use(router)
app.use(createPinia())
app.use(vuetify)
app.use(createHead())

app.mount("#app")
