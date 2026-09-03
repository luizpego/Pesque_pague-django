import { useState } from "react";
import { ArrowRight, HelpCircle, LockKeyhole, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import GoogleLoginButton from "../components/GoogleLoginButton.jsx";
import PasswordField from "../components/PasswordField.jsx";
import Spinner from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login, loginComGoogle } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [tentouEnviar, setTentouEnviar] = useState(false);

  async function aoSubmeter(e) {
    e.preventDefault();
    setErro("");
    setAviso("");
    setTentouEnviar(true);

    if (!username.trim() || !password) {
      setErro("Informe usuário e senha para continuar.");
      return;
    }

    setEnviando(true);
    try {
      await login(username, password);
      navigate("/cardapio");
    } catch {
      setErro("Usuário ou senha inválidos.");
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
          : "Não foi possível concluir o login com Google."
      );
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-panel">
        <span className="section-kicker">Acesso seguro</span>
        <h1>Entre para abrir sua comanda.</h1>
        <p>
          Acesse o cardápio, escolha a mesa e acompanhe seu pedido do lago até
          a cozinha.
        </p>

        <div className="auth-highlights">
          <span><LockKeyhole size={17} aria-hidden="true" />JWT com renovação</span>
          <span><UserRound size={17} aria-hidden="true" />Perfis por papel</span>
          <span><HelpCircle size={17} aria-hidden="true" />Preferências salvas</span>
        </div>
      </div>

      <div className="auth-card">
        <h2>Entrar</h2>

        {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
        {aviso && <p className="mensagem-aviso" role="status">{aviso}</p>}

        <GoogleLoginButton
          onCode={aoCodigoGoogle}
          onConfigMissing={() => setAviso("Configure VITE_GOOGLE_CLIENT_ID para ativar o login Google real.")}
          onError={setErro}
        />

        <div className="divisor"><span>ou entre com usuário e senha</span></div>

        <form onSubmit={aoSubmeter} noValidate>
          <div className="form-grupo">
            <label htmlFor="username">Usuário</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              required
              aria-invalid={tentouEnviar && !username.trim()}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <PasswordField
            id="password"
            value={password}
            invalid={tentouEnviar && !password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="botao botao-primario botao-bloco" disabled={enviando}>
            {enviando ? <Spinner claro rotulo="Entrando" /> : <><span>Entrar</span><ArrowRight size={17} aria-hidden="true" /></>}
          </button>
        </form>

        <button
          type="button"
          className="link-button"
          onClick={() => setAviso("A recuperação de senha depende de um endpoint de backend para envio seguro de e-mail.")}
        >
          Esqueci minha senha
        </button>

        <p className="auth-alt">
          Ainda não tem conta? <Link to="/cadastro">Cadastre-se</Link>
        </p>

        <div className="demo-box">
          <strong>Conta de demonstração</strong>
          <span>Usuário: cliente</span>
          <span>Senha: pescaria123</span>
        </div>
      </div>
    </section>
  );
}
