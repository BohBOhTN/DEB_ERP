import { FormEvent, useState } from "react";
import { login, type ApiError, type CurrentUser } from "./authApi";

interface LoginFormProps {
  onAuthenticated: (user: CurrentUser) => void;
}

export function LoginForm({ onAuthenticated }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const user = await login({ email, password });
      onAuthenticated(user);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.error?.message ?? "Connexion impossible.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="email">Adresse e-mail</label>
        <input
          autoComplete="email"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>

      <div className="field">
        <label htmlFor="password">Mot de passe</label>
        <input
          autoComplete="current-password"
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {error ? <p role="alert">{error}</p> : null}

      <button disabled={isSubmitting} type="submit">
        {isSubmitting ? "Connexion..." : "Se connecter"}
      </button>
    </form>
  );
}
