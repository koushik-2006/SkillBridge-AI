import axios from "axios";
import { useAuthStore } from "../store/authStore";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let queue: Array<() => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        await new Promise<void>((resolve) => queue.push(resolve));
        return api(original);
      }

      isRefreshing = true;
      try {
        const { data } = await api.post("/auth/refresh");
        useAuthStore.getState().setAccessToken(data.data.accessToken);
        queue.forEach((cb) => cb());
        queue = [];
        return api(original);
      } catch (refreshErr) {
        useAuthStore.getState().logout();
        window.location.href = "/login";
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
