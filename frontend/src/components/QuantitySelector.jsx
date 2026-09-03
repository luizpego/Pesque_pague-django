import { Minus, Plus } from "lucide-react";

export default function QuantitySelector({
  id,
  label,
  value,
  min = 1,
  step = 1,
  disabled = false,
  onChange,
}) {
  function definirValor(proximo) {
    const numero = Number(proximo);
    onChange(Math.max(min, Number.isFinite(numero) ? numero : min));
  }

  return (
    <div className="quantity-control">
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        disabled={disabled || Number(value) <= min}
        onClick={() => definirValor(Number(value) - step)}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <label className="somente-leitor-de-tela" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => definirValor(event.target.value)}
      />
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        disabled={disabled}
        onClick={() => definirValor(Number(value) + step)}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
