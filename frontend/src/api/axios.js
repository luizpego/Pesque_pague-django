import axios from "axios";
import { tokenStorage } from "../utils/tokenStorage.js";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });
let renovacao = null;
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
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      const atual = tokenStorage.getAccess();
      if (atual && original.headers.Authorization !== `Bearer ${atual}`) return api(original);
      const refresh = tokenStorage.getRefresh();
      if (refresh) {
        try {
          // Todas as respostas 401 compartilham uma única rotação do refresh.
          if (!renovacao) {
            renovacao = axios.post(`${BASE_URL}/auth/refresh/`, { refresh }, { timeout: 15000 }).then(({ data }) => {
              if (tokenStorage.getRefresh() !== refresh) throw new Error("Sessão alterada durante a renovação.");
              tokenStorage.setTokens(data.access, data.refresh);
            }).catch(e => {
              if ([400, 401].includes(e.response?.status) && tokenStorage.getRefresh() === refresh) tokenStorage.clear();
              throw e;
            }).finally(() => { renovacao = null; });
          }
          await renovacao;
          return api(original);
        } catch (falha) {
          if (tokenStorage.getRefresh()) return Promise.reject(falha);
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
