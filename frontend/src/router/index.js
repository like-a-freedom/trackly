import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import TrackView from '../views/TrackView.vue'

// Lazy-loaded auth views
const AccountView = () => import('../views/AccountView.vue')
const AuthCallbackView = () => import('../views/AuthCallbackView.vue')

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
  },
  {
    path: '/account',
    name: 'Account',
    component: AccountView,
    meta: { requiresAuth: true }
  },
  {
    path: '/auth/callback',
    name: 'AuthCallback',
    component: AuthCallbackView
  }
];

// Dev/test-only route for E2E harness
if (import.meta.env.MODE !== 'production') {
  const E2ETrackTest = () => import('../views/E2ETrackTest.vue');
  routes.push({ path: '/e2e-test', name: 'E2ETrackTest', component: E2ETrackTest });
}

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
