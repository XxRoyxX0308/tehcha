import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useCatalog } from './stores/catalog'
import { useSession } from './stores/session'
import './styles/base.css'

const app = createApp(App)
app.use(createPinia())

// Load catalog + the current user's points before the first paint so guards and prices are right.
const catalog = useCatalog()
const session = useSession()
await Promise.all([catalog.load(), session.refreshPoints()])

app.use(router)
app.mount('#app')
