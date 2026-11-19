import axios from 'axios';
import { ElMessage } from 'element-plus';

export const TOKEN_KEY = 'campus_token';

const http = axios.create({
  baseURL: '/api',
  timeout: 20000
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && body.code === 0) {
      return body;
    }
    const message = body?.message || '请求失败';
    ElMessage.error(message);
    return Promise.reject(new Error(message));
  },
  (error) => {
    const status = error.response?.status;
    const body = error.response?.data;
    const message = body?.message || error.message || '网络异常';

    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      const current = window.location.hash || '';
      if (!current.includes('/login')) {
        ElMessage.warning('登录已失效，请重新登录');
        window.location.hash = '#/login';
      }
    } else {
      ElMessage.error(message);
    }
    return Promise.reject(new Error(message));
  }
);

export default http;
