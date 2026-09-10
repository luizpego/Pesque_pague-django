import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const api = axios.create({ baseURL: BASE_URL });
const ROTAS_PUBLICAS = ["/cardapio/", "/categorias/", "/conteudo-publico/", "/lagos/", "/especies/", "/regras-pesca/", "/servicos-pesca/"];

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pp_access_token");
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
      const refresh = localStorage.getItem("pp_refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
          localStorage.setItem("pp_access_token", data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch (refreshError) {
          localStorage.removeItem("pp_access_token");
          localStorage.removeItem("pp_refresh_token");
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
