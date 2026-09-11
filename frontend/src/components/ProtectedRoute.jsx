import { Navigate } from "react-router-dom";
import Spinner from "./Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * Protege rotas que exigem login. Opcionalmente, exige um papel de staff
 * operacional (garçom/cozinha/gerente) quando `somenteStaff` é true.
 */
export default function ProtectedRoute({ children, somenteStaff = false, papeis = null }) {
  const { estaAutenticado, carregando, ehStaffOperacional, usuario } = useAuth();

  if (carregando) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <Spinner /> Validando acesso...
      </div>
    );
  }

  if (!estaAutenticado) {
    return <Navigate to="/entrar" replace />;
  }

  if (somenteStaff && !ehStaffOperacional) {
    return <Navigate to="/cardapio" replace />;
  }

  if (papeis && !usuario?.is_superuser && !papeis.includes(usuario?.papel)) {
    return <Navigate to="/painel" replace />;
  }

  return children;
}
