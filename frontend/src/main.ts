import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useCart } from './stores/cart'
import { useCatalog } from './stores/catalog'
import { useSession } from './stores/session'
import './styles/base.css'

const app = createApp(App)
app.use(createPinia())

// Menu and the signed-in user before the first paint, so guards and prices are right.
const catalog = useCatalog()
const session = useSession()
const cart = useCart() // created first so it sees the sign-in and merges a guest cart
await Promise.all([catalog.load(), session.refresh()])
await cart.sync().catch(() => {})

app.use(router)
app.mount('#app')
