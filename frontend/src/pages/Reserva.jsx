import { useRef, useState } from "react";
import api from "../api/axios.js";
import { erroApi } from "../utils/atendimento.js";
import "../styles/atendimento.css";

export default function Reserva() {
  const [dados, setDados] = useState({ nome: "", telefone: "", data: "", horario: "", pessoas: 1, observacao: "" });
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const chave = useRef(crypto.randomUUID());
  const enviando = useRef(false);
  async function enviar(e) {
    e.preventDefault();
    if (enviando.current) return;
    enviando.current = true; setOcupado(true);
    try { const { data } = await api.post("/reservas/solicitar/", dados, { headers: { "Idempotency-Key": chave.current } }); setResultado(data); setErro(""); }
    catch (error) { setErro(erroApi(error)); }
    finally { enviando.current = false; setOcupado(false); }
  }
  return <div className="service-page"><h1>Solicitar reserva</h1>{resultado ? <p role="status">Solicitação #{resultado.protocolo} recebida. Aguarde a confirmação do estabelecimento pelo telefone informado.</p> : <form className="service-open-form" onSubmit={enviar}><div className="service-fields">{[["nome", "Nome", "text"], ["telefone", "Telefone com DDD", "tel"], ["data", "Data", "date"], ["horario", "Horário", "time"], ["pessoas", "Número de pessoas", "number"]].map(([k, rotulo, tipo]) => <label key={k}>{rotulo}<input type={tipo} min={k === "pessoas" ? 1 : undefined} max={k === "pessoas" ? 500 : undefined} maxLength={k === "nome" ? 120 : 30} required value={dados[k]} onChange={e => setDados({ ...dados, [k]: e.target.value })} /></label>)}</div><label className="service-label">Observação<textarea maxLength={500} value={dados.observacao} onChange={e => setDados({ ...dados, observacao: e.target.value })} /></label>{erro && <p className="mensagem-erro" role="alert">{erro}</p>}<button className="botao botao-primario" disabled={ocupado}>{ocupado ? "Enviando..." : "Solicitar reserva"}</button></form>}</div>;
}
