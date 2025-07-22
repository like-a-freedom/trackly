import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import TrackView from '../views/TrackView.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeView
  },
  {
    path: '/track/:id',
    name: 'Track',
    component: TrackView,
    props: true
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  // Optimize scrolling behavior for better UX
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

export default router
