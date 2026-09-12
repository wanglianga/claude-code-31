import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api';

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
  { path: '/schedule', name: 'schedule', component: () => import('./views/ScheduleView.vue') },
  { path: '/projects', name: 'projects', component: () => import('./views/ProjectsView.vue') },
  { path: '/projects/:id', name: 'project-detail', component: () => import('./views/ProjectDetailView.vue') },
  { path: '/tasks', name: 'tasks', component: () => import('./views/TasksView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (!to.meta.public && !getToken()) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
});
