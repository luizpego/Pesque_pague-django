import { CheckCircle2, CircleDashed, Clock3, CookingPot, PackageCheck, XCircle } from "lucide-react";
import { STATUS_COMANDA, STATUS_PAGAMENTO } from "../utils/formatters.js";

const ICONES = {
  aberta: CircleDashed,
  enviada: Clock3,
  em_preparo: CookingPot,
  pronta: PackageCheck,
  entregue: CheckCircle2,
  fechada: CheckCircle2,
  cancelada: XCircle,
  pending: Clock3,
  in_process: CircleDashed,
  approved: CheckCircle2,
  rejected: XCircle,
  cancelled: XCircle,
};

export default function StatusBadge({ status, tipo = "comanda", pago = false }) {
  const Icone = ICONES[status] || CircleDashed;
  const label = tipo === "pagamento"
    ? STATUS_PAGAMENTO[status] || status
    : STATUS_COMANDA[status] || status;

  return (
    <span className={`status-badge status-${status} ${pago ? "status-pago" : ""}`}>
      <Icone size={14} aria-hidden="true" />
      {pago ? "Pago" : label}
    </span>
  );
}
