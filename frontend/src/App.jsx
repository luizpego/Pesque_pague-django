import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Cadastro from "./pages/Cadastro.jsx";
import Cardapio from "./pages/Cardapio.jsx";
import Carrinho from "./pages/Carrinho.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import MinhasComandas from "./pages/MinhasComandas.jsx";
import OperacaoPesca from "./pages/OperacaoPesca.jsx";
import Pagamento from "./pages/Pagamento.jsx";
import Painel from "./pages/Painel.jsx";
import PesquePague from "./pages/PesquePague.jsx";
import Perfil from "./pages/Perfil.jsx";
import ImprimirComanda from "./pages/ImprimirComanda.jsx";
import ImprimirPesca from "./pages/ImprimirPesca.jsx";

const PAGAMENTO_ONLINE_ATIVO = import.meta.env.VITE_ONLINE_PAYMENTS_ENABLED === "true";

export default function App() {
  return (
    <div className="app-shell">
      <a href="#conteudo" className="pular-conteudo">Pular para o conteúdo</a>
      <Navbar />
      <main id="conteudo" className="conteudo-principal page-enter" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/entrar" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/cardapio" element={<Cardapio />} />
          <Route path="/pesque-pague" element={<PesquePague />} />
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
              <ProtectedRoute somenteStaff>
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
          <Route path="*" element={<Home />} />
        </Routes>
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
