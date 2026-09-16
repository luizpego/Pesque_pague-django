import { CalendarDays, Globe, Image, Target, Users } from "lucide-react";

export const recursosGestao = {
  configuracao: {
    titulo: "Site e impressão", singular: "configuração", endpoint: "/configuracao/", icone: Globe,
    resumo: i => i.nome, detalhe: i => i.endereco || "Informações do estabelecimento",
    campos: [
      { nome: "nome", rotulo: "Nome do pesqueiro", required: true },
      { nome: "banner", rotulo: "Banner principal", tipo: "file" },
      ...[["descricao_inicio", "Apresentação"], ["descricao_restaurante", "Restaurante"], ["descricao_pesque_pague", "Pesca"], ["descricao_piscinas", "Piscinas"], ["descricao_atrativos", "Atrativos"]].map(([nome, rotulo]) => ({ nome, rotulo, tipo: "textarea", largo: true })),
      ...[["telefone", "Telefone"], ["whatsapp", "WhatsApp"], ["email", "E-mail"], ["endereco", "Endereço"], ["link_mapa", "Link do mapa"], ["aviso_importante", "Aviso"], ["impressora_cozinha", "Nome da impressora da cozinha"]].map(([nome, rotulo]) => ({ nome, rotulo })),
      { nome: "papel_cozinha", rotulo: "Papel da cozinha", tipo: "select", required: true, opcoes: [["80mm", "80 mm"], ["58mm", "58 mm"]] },
    ],
  },
  horarios: {
    titulo: "Horários", singular: "horário", endpoint: "/horarios/", icone: CalendarDays,
    resumo: i => i.dia_nome, detalhe: i => i.fechado ? "Fechado" : `${i.abre_as} - ${i.fecha_as}`,
    campos: [
      { nome: "dia_semana", rotulo: "Dia", tipo: "select", required: true, opcoes: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"].map((dia, i) => [i, dia]) },
      { nome: "abre_as", rotulo: "Abre às", tipo: "time" }, { nome: "fecha_as", rotulo: "Fecha às", tipo: "time" },
      { nome: "fechado", rotulo: "Fechado", tipo: "checkbox" }, { nome: "observacao", rotulo: "Observação" },
    ],
  },
  galeria: {
    titulo: "Fotos", singular: "foto", endpoint: "/galeria/", icone: Image,
    resumo: i => i.titulo || i.imagem_alt, detalhe: i => `${i.area} · ${i.ativa ? "Publicada" : "Oculta"}`,
    campos: [
      { nome: "titulo", rotulo: "Título" }, { nome: "imagem", rotulo: "Foto", tipo: "file" },
      { nome: "imagem_alt", rotulo: "Descrição da foto", required: true },
      { nome: "area", rotulo: "Área", tipo: "select", required: true, opcoes: [["restaurante", "Restaurante"], ["pesca", "Pesca"], ["piscina", "Piscinas"], ["atrativos", "Atrativos"]] },
      { nome: "ordem", rotulo: "Ordem", tipo: "number", min: 0 }, { nome: "ativa", rotulo: "Publicada", tipo: "checkbox" },
    ],
  },
  usuarios: {
    titulo: "Usuários", singular: "usuário", endpoint: "/usuarios-gestao/", icone: Users,
    resumo: i => i.username, detalhe: i => `${i.is_superuser ? "Administrador" : i.papel} · ${i.is_active ? "Ativo" : "Desativado"}`,
    campos: [
      { nome: "username", rotulo: "Usuário", required: true }, { nome: "first_name", rotulo: "Nome" },
      { nome: "last_name", rotulo: "Sobrenome" }, { nome: "email", rotulo: "E-mail", tipo: "email" },
      { nome: "telefone", rotulo: "Telefone" }, { nome: "password", rotulo: "Nova senha", tipo: "password" },
      { nome: "papel", rotulo: "Perfil", tipo: "select", required: true, opcoes: [["gerente", "Administrador / dono"], ["garcom", "Garçom"], ["cozinha", "Cozinha"], ["cliente", "Cliente"], ["caixa", "Caixa"]] },
      { nome: "is_active", rotulo: "Usuário ativo", tipo: "checkbox" },
    ],
  },
  reservas: {
    titulo: "Reservas", singular: "reserva", endpoint: "/reservas/", icone: CalendarDays,
    resumo: i => `${i.data} ${i.horario} · ${i.nome}`, detalhe: i => `${i.pessoas} pessoas · ${i.telefone} · ${i.status}`,
    campos: [
      { nome: "nome", rotulo: "Nome", required: true }, { nome: "telefone", rotulo: "Telefone", required: true },
      { nome: "data", rotulo: "Data", tipo: "date", required: true }, { nome: "horario", rotulo: "Horário", tipo: "time", required: true },
      { nome: "pessoas", rotulo: "Pessoas", tipo: "number", min: 1, required: true },
      { nome: "observacao", rotulo: "Observação", tipo: "textarea", largo: true },
      { nome: "status", rotulo: "Status", tipo: "select", required: true, opcoes: [["pendente", "Pendente"], ["confirmada", "Confirmada"], ["cancelada", "Cancelada / recusada"], ["finalizada", "Finalizada"]] },
    ],
  },
  metas: {
    titulo: "Metas diárias", singular: "meta", endpoint: "/metas/", icone: Target,
    resumo: i => i.data, detalhe: i => `R$ ${i.valor}`,
    campos: [{ nome: "data", rotulo: "Data", tipo: "date", required: true }, { nome: "valor", rotulo: "Meta (R$)", tipo: "number", min: "0.01", step: "0.01", required: true }],
  },
};
