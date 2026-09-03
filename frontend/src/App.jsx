import { Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Cadastro from "./pages/Cadastro.jsx";
import Cardapio from "./pages/Cardapio.jsx";
import Carrinho from "./pages/Carrinho.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import MinhasComandas from "./pages/MinhasComandas.jsx";
import Pagamento from "./pages/Pagamento.jsx";
import Painel from "./pages/Painel.jsx";
import Perfil from "./pages/Perfil.jsx";

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
          <Route
            path="/cardapio"
            element={
              <ProtectedRoute>
                <Cardapio />
              </ProtectedRoute>
            }
          />
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
              <ProtectedRoute>
                <Pagamento />
              </ProtectedRoute>
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
          <span>Sistema de comandas para lago, restaurante e equipe.</span>
        </div>
        <span>React + Django REST + JWT</span>
      </footer>
    </div>
  );
}
