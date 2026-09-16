import { ClipboardList, CookingPot, History, BarChart3, Settings2, Banknote, Package, Table, LayoutDashboard } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AtendimentoNav() {
  const { ehGerente, usuario } = useAuth();
  const cozinha = usuario?.papel === "cozinha" && !ehGerente;
  return <nav className="service-nav" aria-label="Atendimento">
    {ehGerente && <NavLink to="/dashboard"><LayoutDashboard size={18} />Visão geral</NavLink>}
    {!cozinha && <NavLink to="/mesas"><Table size={18} />Mesas</NavLink>}
    {!cozinha && <NavLink to="/atendimento"><ClipboardList size={18} />Comandas</NavLink>}
    <NavLink to="/painel"><CookingPot size={18} />Pedidos</NavLink>
    {!cozinha && <NavLink to="/historico"><History size={18} />Histórico</NavLink>}
    {(ehGerente || usuario?.papel === "caixa") && <NavLink to="/caixa"><Banknote size={18} />Caixa</NavLink>}
    {ehGerente && <NavLink to="/estoque"><Package size={18} />Estoque</NavLink>}
    {ehGerente && <NavLink to="/registros"><BarChart3 size={18} />Registros</NavLink>}
    {ehGerente && <NavLink to="/administracao"><Settings2 size={18} />Cadastros</NavLink>}
  </nav>;
}
