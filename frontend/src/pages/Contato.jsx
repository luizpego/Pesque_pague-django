import { useEffect, useState } from "react";
import { Clock3, Mail, MapPin, Phone } from "lucide-react";
import api from "../api/axios.js";
import PageHeader from "../components/PageHeader.jsx";
import Seo from "../components/Seo.jsx";
import { montarLinkContato } from "../utils/formatters.js";

function formatarHora(valor) {
  return valor ? valor.slice(0, 5) : "";
}

export default function Contato() {
  const [conteudo, setConteudo] = useState(null);

  useEffect(() => {
    api.get("/conteudo-publico/").then(({ data }) => setConteudo(data)).catch(() => {});
  }, []);

  const estabelecimento = conteudo?.estabelecimento || {};
  const contato = estabelecimento.whatsapp || estabelecimento.telefone;

  return (
    <div className="contact-page">
      <Seo
        titulo="Contato e localização | Pesque & Pague"
        descricao="Confira endereço, contato e horários de funcionamento do Pesque & Pague."
        caminho="/contato"
      />
      <PageHeader
        etiqueta="Contato e localização"
        titulo="Tudo o que você precisa para planejar a visita."
        descricao="Consulte os canais e horários publicados pelo estabelecimento."
      />

      <section className="contact-layout">
        <div className="contact-details">
          {estabelecimento.endereco && (estabelecimento.link_mapa ? (
            <a href={estabelecimento.link_mapa} target="_blank" rel="noreferrer">
              <MapPin size={21} aria-hidden="true" /><span><strong>Endereço</strong>{estabelecimento.endereco}</span>
            </a>
          ) : (
            <div><MapPin size={21} aria-hidden="true" /><span><strong>Endereço</strong>{estabelecimento.endereco}</span></div>
          ))}
          {contato && (
            <a href={montarLinkContato(contato, Boolean(estabelecimento.whatsapp))}>
              <Phone size={21} aria-hidden="true" /><span><strong>Telefone e WhatsApp</strong>{contato}</span>
            </a>
          )}
          {estabelecimento.email && (
            <a href={`mailto:${estabelecimento.email}`}>
              <Mail size={21} aria-hidden="true" /><span><strong>E-mail</strong>{estabelecimento.email}</span>
            </a>
          )}
        </div>

        {conteudo?.horarios?.length > 0 && (
          <section className="schedule-section" aria-labelledby="contato-horarios">
            <div className="section-heading">
              <Clock3 size={20} aria-hidden="true" />
              <h2 id="contato-horarios">Horários</h2>
            </div>
            <dl className="schedule-list">
              {conteudo.horarios.map((horario) => (
                <div key={horario.id}>
                  <dt>{horario.dia_nome}</dt>
                  <dd>{horario.fechado ? "Fechado" : `${formatarHora(horario.abre_as)} às ${formatarHora(horario.fecha_as)}`}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </section>
    </div>
  );
}
