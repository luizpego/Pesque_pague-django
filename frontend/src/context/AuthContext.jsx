import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios.js";

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
    const token = localStorage.getItem("pp_access_token");
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
    localStorage.setItem("pp_access_token", data.access);
    localStorage.setItem("pp_refresh_token", data.refresh);
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
    localStorage.setItem("pp_access_token", data.access);
    localStorage.setItem("pp_refresh_token", data.refresh);
    await carregarPerfil();
  }

  async function registrar(dados) {
    await api.post("/auth/registro/", dados);
    await login(dados.username, dados.password);
  }

  function logout() {
    localStorage.removeItem("pp_access_token");
    localStorage.removeItem("pp_refresh_token");
    setUsuario(null);
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
      usuario && ["garcom", "cozinha", "gerente"].includes(usuario.papel)
    ),
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
