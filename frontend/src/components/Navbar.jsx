import { useEffect, useState } from "react";
import { Fish, LayoutDashboard, LogIn, LogOut, Menu, Scale, ShoppingBag, UserRound, X } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useCart } from "../context/CartContext.jsx";
import BarraAcessibilidade from "./BarraAcessibilidade.jsx";

export default function Navbar() {
  const { estaAutenticado, usuario, logout, ehStaffOperacional, podeOperarPesca } = useAuth();
  const { totalItens } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const [menuCompacto, setMenuCompacto] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1280px)");
    const atualizar = () => setMenuCompacto(media.matches);
    atualizar();
    media.addEventListener("change", atualizar);
    return () => media.removeEventListener("change", atualizar);
  }, []);

  useEffect(() => {
    setMenuAberto(false);
  }, [location.pathname]);

  async function sair() {
    await logout();
    setMenuAberto(false);
    navigate("/entrar");
  }

  function classeLink({ isActive }) {
    return isActive ? "ativo" : "";
  }

  return (
    <header className="site-header">
      <BarraAcessibilidade />
      <nav className="navbar" aria-label="Navegação principal">
        <div className="navbar-conteudo">
          <Link to="/" className="marca" onClick={() => setMenuAberto(false)}>
            <span className="marca-simbolo" aria-hidden="true">
              <Fish size={22} />
            </span>
            <span>
              Pesque &amp; Pague
              <small>Lago, cozinha e comanda</small>
            </span>
          </Link>

          <button
            type="button"
            className="navbar-botao-menu icon-button"
            aria-expanded={menuAberto}
            aria-controls="menu-principal"
            aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMenuAberto((v) => !v)}
          >
            {menuAberto ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>

          <ul
            id="menu-principal"
            className={`navbar-links ${menuAberto ? "aberto" : ""}`}
            aria-hidden={menuCompacto && !menuAberto}
            inert={menuCompacto && !menuAberto ? "" : undefined}
          >
            <li><NavLink to="/" end className={classeLink}>Início</NavLink></li>
            <li><NavLink to="/restaurante" className={classeLink}>Restaurante</NavLink></li>
            <li><NavLink to="/cardapio" className={classeLink}>Cardápio</NavLink></li>
            <li><NavLink to="/pesque-pague" className={classeLink}>Pesque-pague</NavLink></li>
            <li><NavLink to="/contato" className={classeLink}>Contato</NavLink></li>
            {estaAutenticado ? (
              <>
                <li>
                  <NavLink to="/carrinho" className={({ isActive }) => `nav-cart ${isActive ? "ativo" : ""}`}>
                    <ShoppingBag size={17} aria-hidden="true" />
                    Carrinho
                    {totalItens > 0 && (
                      <span className="carrinho-contador" aria-label={`${totalItens} itens no carrinho`}>
                        {totalItens}
                      </span>
                    )}
                  </NavLink>
                </li>
                <li><NavLink to="/minhas-comandas" className={classeLink}>Comandas</NavLink></li>
                {ehStaffOperacional && (
                  <>
                    <li>
                      <NavLink to="/painel" className={classeLink}>
                        <LayoutDashboard size={16} aria-hidden="true" />
                        Pedidos
                      </NavLink>
                    </li>
                    {podeOperarPesca && (
                      <li>
                        <NavLink to="/operacao-pesca" className={classeLink}>
                          <Scale size={16} aria-hidden="true" />
                          Operação pesca
                        </NavLink>
                      </li>
                    )}
                  </>
                )}
                <li>
                  <NavLink to="/perfil" className={classeLink}>
                    <UserRound size={16} aria-hidden="true" />
                    {usuario?.first_name || usuario?.username}
                  </NavLink>
                </li>
                <li><button type="button" className="nav-exit" onClick={sair}><LogOut size={16} aria-hidden="true" />Sair</button></li>
              </>
            ) : (
              <>
                <li><NavLink to="/entrar" className={classeLink}><LogIn size={16} aria-hidden="true" />Entrar</NavLink></li>
                <li><NavLink to="/cadastro" className="nav-cta">Criar conta</NavLink></li>
              </>
            )}
          </ul>
        </div>
      </nav>
      {menuAberto && <button type="button" className="menu-scrim" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} />}
    </header>
  );
}
