import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export default function PasswordField({
  id,
  label = "Senha",
  value,
  onChange,
  autoComplete = "current-password",
  help,
  invalid = false,
  required = true,
}) {
  const [visivel, setVisivel] = useState(false);
  const helpId = help ? `${id}-help` : undefined;

  return (
    <div className="form-grupo">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          name={id}
          type={visivel ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={invalid}
          aria-describedby={helpId}
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setVisivel((atual) => !atual)}
        >
          {visivel ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {help && <small id={helpId}>{help}</small>}
    </div>
  );
}
