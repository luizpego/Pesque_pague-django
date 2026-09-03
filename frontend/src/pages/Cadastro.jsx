import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import GoogleLoginButton from "../components/GoogleLoginButton.jsx";
import PasswordField from "../components/PasswordField.jsx";
import Spinner from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Cadastro() {
  const { registrar, loginComGoogle } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "", first_name: "", email: "", telefone: "", password: "",
  });
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [tentouEnviar, setTentouEnviar] = useState(false);

  function atualizarCampo(campo) {
    return (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  }

  async function aoSubmeter(e) {
    e.preventDefault();
    setErro("");
    setAviso("");
    setTentouEnviar(true);

    if (!form.first_name.trim() || !form.username.trim() || !form.email.trim() || !form.password) {
      setErro("Preencha os campos obrigatórios para criar a conta.");
      return;
    }

    setEnviando(true);
    try {
      await registrar(form);
      navigate("/cardapio");
    } catch (err) {
      const dados = err.response?.data;
      const primeiraMensagem = dados && Object.values(dados)[0];
      setErro(
        Array.isArray(primeiraMensagem) ? primeiraMensagem[0] : "Não foi possível criar sua conta."
      );
    } finally {
      setEnviando(false);
    }
  }

  async function aoCodigoGoogle(code) {
    setErro("");
    setAviso("");
    try {
      await loginComGoogle(code);
      navigate("/cardapio");
    } catch (err) {
      const status = err.response?.status;
      setErro(
        status === 404
          ? "Google Login está preparado no front-end, mas o backend ainda precisa expor o endpoint de troca por JWT."
          : "Não foi possível concluir o cadastro com Google."
      );
    }
  }

  return (
    <section className="auth-layout auth-layout-compact">
      <div className="auth-panel">
        <span className="section-kicker">Cadastro</span>
        <h1>Crie sua conta para pedir com tranquilidade.</h1>
        <p>
          O cadastro mantém histórico de comandas, preferências de acessibilidade
          e acesso ao pagamento quando configurado.
        </p>
        <div className="auth-highlights">
          <span><ShieldCheck size={17} aria-hidden="true" />Dados mínimos</span>
          <span><ShieldCheck size={17} aria-hidden="true" />Sem credenciais no front</span>
        </div>
      </div>

      <div className="auth-card">
        <h2>Criar conta</h2>

        {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
        {aviso && <p className="mensagem-aviso" role="status">{aviso}</p>}

        <GoogleLoginButton
          onCode={aoCodigoGoogle}
          onConfigMissing={() => setAviso("Configure VITE_GOOGLE_CLIENT_ID para ativar cadastro/login Google real.")}
          onError={setErro}
        />

        <div className="divisor"><span>ou cadastre manualmente</span></div>

        <form onSubmit={aoSubmeter} noValidate>
          <div className="form-grid">
            <div className="form-grupo">
              <label htmlFor="first_name">Nome</label>
              <input
                id="first_name"
                required
                aria-invalid={tentouEnviar && !form.first_name.trim()}
                value={form.first_name}
                onChange={atualizarCampo("first_name")}
              />
            </div>
            <div className="form-grupo">
              <label htmlFor="telefone">Telefone</label>
              <input id="telefone" autoComplete="tel" value={form.telefone} onChange={atualizarCampo("telefone")} />
            </div>
          </div>
          <div className="form-grupo">
            <label htmlFor="username">Usuário</label>
            <input
              id="username"
              autoComplete="username"
              required
              aria-invalid={tentouEnviar && !form.username.trim()}
              value={form.username}
              onChange={atualizarCampo("username")}
            />
          </div>
          <div className="form-grupo">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={tentouEnviar && !form.email.trim()}
              value={form.email}
              onChange={atualizarCampo("email")}
            />
          </div>
          <PasswordField
            id="password"
            value={form.password}
            autoComplete="new-password"
            help="Use ao menos 8 caracteres, evitando senhas muito comuns."
            invalid={tentouEnviar && !form.password}
            onChange={atualizarCampo("password")}
          />
          <button type="submit" className="botao botao-primario botao-bloco" disabled={enviando}>
            {enviando ? <Spinner claro rotulo="Criando conta" /> : <><span>Criar conta</span><ArrowRight size={17} aria-hidden="true" /></>}
          </button>
        </form>

        <p className="auth-alt">
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </p>
      </div>
    </section>
  );
}
