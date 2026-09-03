export const formatadorMoeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const formatadorDataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export const STATUS_COMANDA = {
  aberta: "Aberta",
  enviada: "Enviada",
  em_preparo: "Em preparo",
  pronta: "Pronta",
  entregue: "Entregue",
  fechada: "Fechada",
  cancelada: "Cancelada",
};

export const STATUS_PAGAMENTO = {
  pending: "Aguardando Pix",
  in_process: "Processando",
  approved: "Aprovado",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
};

export function formatarQuantidade(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "0";
  return Number.isInteger(numero) ? String(numero) : numero.toLocaleString("pt-BR");
}
