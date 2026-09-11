import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Spinner from "./components/Spinner.jsx";

const Cadastro = lazy(() => import("./pages/Cadastro.jsx"));
const Cardapio = lazy(() => import("./pages/Cardapio.jsx"));
const Carrinho = lazy(() => import("./pages/Carrinho.jsx"));
const Contato = lazy(() => import("./pages/Contato.jsx"));
const Home = lazy(() => import("./pages/Home.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const MinhasComandas = lazy(() => import("./pages/MinhasComandas.jsx"));
const NaoEncontrada = lazy(() => import("./pages/NaoEncontrada.jsx"));
const OperacaoPesca = lazy(() => import("./pages/OperacaoPesca.jsx"));
const Pagamento = lazy(() => import("./pages/Pagamento.jsx"));
const Painel = lazy(() => import("./pages/Painel.jsx"));
const PesquePague = lazy(() => import("./pages/PesquePague.jsx"));
const Perfil = lazy(() => import("./pages/Perfil.jsx"));
const Restaurante = lazy(() => import("./pages/Restaurante.jsx"));
const ImprimirComanda = lazy(() => import("./pages/ImprimirComanda.jsx"));
const ImprimirPesca = lazy(() => import("./pages/ImprimirPesca.jsx"));

const PAGAMENTO_ONLINE_ATIVO = import.meta.env.VITE_ONLINE_PAYMENTS_ENABLED === "true";

export default function App() {
  return (
    <div className="app-shell">
      <a href="#conteudo" className="pular-conteudo">Pular para o conteúdo</a>
      <Navbar />
      <main id="conteudo" className="conteudo-principal page-enter" tabIndex={-1}>
        <Suspense fallback={<div className="route-loading" role="status"><Spinner />Carregando página...</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/entrar" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/cardapio" element={<Cardapio />} />
          <Route path="/restaurante" element={<Restaurante />} />
          <Route path="/pesque-pague" element={<PesquePague />} />
          <Route path="/contato" element={<Contato />} />
          <Route
            path="/carrinho"
            element={
              <ProtectedRoute>
                <Carrinho />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pagamento"
            element={
              PAGAMENTO_ONLINE_ATIVO ? (
                <ProtectedRoute>
                  <Pagamento />
                </ProtectedRoute>
              ) : (
                <Navigate to="/carrinho" replace />
              )
            }
          />
          <Route
            path="/minhas-comandas"
            element={
              <ProtectedRoute>
                <MinhasComandas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/painel"
            element={
              <ProtectedRoute somenteStaff>
                <Painel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/operacao-pesca"
            element={
              <ProtectedRoute somenteStaff papeis={["garcom", "gerente"]}>
                <OperacaoPesca />
              </ProtectedRoute>
            }
          />
          <Route
            path="/imprimir/comanda/:id"
            element={
              <ProtectedRoute>
                <ImprimirComanda />
              </ProtectedRoute>
            }
          />
          <Route
            path="/imprimir/pesca/:id"
            element={
              <ProtectedRoute somenteStaff>
                <ImprimirPesca />
              </ProtectedRoute>
            }
          />
          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <Perfil />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NaoEncontrada />} />
        </Routes>
        </Suspense>
      </main>
      <footer className="rodape">
        <div>
          <strong>Pesque &amp; Pague</strong>
          <span>Restaurante, pesca e atendimento no mesmo lugar.</span>
        </div>
        <span>Pagamento realizado presencialmente no estabelecimento.</span>
      </footer>
    </div>
  );
}
