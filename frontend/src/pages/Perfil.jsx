import { useState } from "react";
import { Contrast, Mail, Phone, ShieldCheck, Type, UserRound } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";

export default function Perfil() {
  const { usuario, atualizarPreferencias } = useAuth();
  const toast = useToast();
  const [salvando, setSalvando] = useState(null);

  async function alternarPreferencia(campo, rotulo) {
    setSalvando(campo);
    try {
      await atualizarPreferencias({ [campo]: !usuario[campo] });
      toast.sucesso(`${rotulo} atualizado.`);
    } catch {
      toast.erro("Não foi possível salvar a preferência.");
    } finally {
      setSalvando(null);
    }
  }

  if (!usuario) return null;

  return (
    <div className="profile-page">
      <PageHeader
        etiqueta="Conta"
        titulo="Meu perfil"
        descricao="Dados de acesso, papel operacional e preferências visuais salvas na sua conta."
      />

      <section className="profile-layout">
        <article className="profile-card">
          <div className="profile-avatar" aria-hidden="true">
            <UserRound size={34} />
          </div>
          <h2>{usuario.first_name || usuario.username} {usuario.last_name}</h2>
          <p>@{usuario.username}</p>
          <div className="profile-details">
            <span><Mail size={16} aria-hidden="true" />{usuario.email || "E-mail não informado"}</span>
            <span><Phone size={16} aria-hidden="true" />{usuario.telefone || "Telefone não informado"}</span>
            <span><ShieldCheck size={16} aria-hidden="true" />{usuario.papel}</span>
          </div>
        </article>

        <article className="settings-panel">
          <span className="section-kicker">Acessibilidade</span>
          <h2>Preferências visuais</h2>
          <p>Essas opções também continuam disponíveis no topo para ajuste rápido.</p>

          <label className="toggle-row">
            <span><Contrast size={18} aria-hidden="true" />Sempre usar alto contraste</span>
            <input
              type="checkbox"
              checked={usuario.preferencia_alto_contraste}
              disabled={salvando === "preferencia_alto_contraste"}
              onChange={() => alternarPreferencia("preferencia_alto_contraste", "Alto contraste")}
            />
          </label>

          <label className="toggle-row">
            <span><Type size={18} aria-hidden="true" />Sempre usar fonte ampliada</span>
            <input
              type="checkbox"
              checked={usuario.preferencia_fonte_grande}
              disabled={salvando === "preferencia_fonte_grande"}
              onChange={() => alternarPreferencia("preferencia_fonte_grande", "Fonte ampliada")}
            />
          </label>
        </article>
      </section>
    </div>
  );
}
