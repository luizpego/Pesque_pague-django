import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios.js";
import { tokenStorage } from "../utils/tokenStorage.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  async function carregarPerfil() {
    try {
      const { data } = await api.get("/auth/me/");
      setUsuario(data);
    } catch {
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const token = tokenStorage.getAccess();
    if (token) {
      carregarPerfil();
    } else {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!usuario) return;
    const altoContraste = Boolean(usuario.preferencia_alto_contraste);
    const fonteGrande = Boolean(usuario.preferencia_fonte_grande);
    document.body.classList.toggle("alto-contraste", altoContraste);
    document.body.classList.toggle("fonte-grande", fonteGrande);
    localStorage.setItem("pp_alto_contraste", String(altoContraste));
    localStorage.setItem("pp_fonte_grande", String(fonteGrande));
    window.dispatchEvent(new CustomEvent("pp-preferencias-visuais", {
      detail: { altoContraste, fonteGrande },
    }));
  }, [usuario]);

  async function login(username, password) {
    const { data } = await api.post("/auth/login/", { username, password });
    tokenStorage.setTokens(data.access, data.refresh);
    await carregarPerfil();
  }

  async function loginComGoogle(code) {
    const endpoint = import.meta.env.VITE_GOOGLE_AUTH_ENDPOINT || "/auth/google/";
    const { data } = await api.post(
      endpoint,
      {
        code,
        origin: window.location.origin,
      },
      {
        headers: { "X-Requested-With": "XmlHttpRequest" },
      }
    );
    tokenStorage.setTokens(data.access, data.refresh);
    await carregarPerfil();
  }

  async function registrar(dados) {
    await api.post("/auth/registro/", dados);
    await login(dados.username, dados.password);
  }

  async function logout() {
    const refresh = tokenStorage.getRefresh();
    try {
      if (refresh) await api.post("/auth/logout/", { refresh });
    } catch {
      // A limpeza local ainda encerra a sessão neste navegador.
    } finally {
      tokenStorage.clear();
      setUsuario(null);
    }
  }

  async function atualizarPreferencias(preferencias) {
    const { data } = await api.patch("/auth/me/", preferencias);
    setUsuario(data);
  }

  const valor = {
    usuario,
    carregando,
    estaAutenticado: Boolean(usuario),
    ehStaffOperacional: Boolean(
      usuario && (usuario.is_superuser || ["garcom", "cozinha", "gerente"].includes(usuario.papel))
    ),
    ehGerente: Boolean(usuario?.is_superuser || usuario?.papel === "gerente"),
    podeOperarPesca: Boolean(usuario && (usuario.is_superuser || ["garcom", "gerente"].includes(usuario.papel))),
    login,
    loginComGoogle,
    registrar,
    logout,
    atualizarPreferencias,
  };

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return contexto;
}
