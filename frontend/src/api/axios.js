import axios from "axios";
import { tokenStorage } from "../utils/tokenStorage.js";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });
const ROTAS_PUBLICAS = ["/cardapio/", "/categorias/", "/conteudo-publico/", "/lagos/", "/especies/", "/regras-pesca/", "/servicos-pesca/"];

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Renova o token automaticamente quando expira (401), tentando uma única vez.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = tokenStorage.getRefresh();
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
          tokenStorage.setTokens(data.access, data.refresh);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          tokenStorage.clear();
        }
      }
      const ehConsultaPublica = original.method === "get" && ROTAS_PUBLICAS.some((rota) => original.url?.startsWith(rota));
      if (ehConsultaPublica) {
        delete original.headers.Authorization;
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
