import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "../../components/ui/Button/Button.js";
import { FormField } from "../../components/ui/FormField/FormField.js";
import { IconButton } from "../../components/ui/IconButton/IconButton.js";
import { TextInput } from "../../components/ui/TextInput/TextInput.js";
import { describeError } from "../../i18n/errors.js";
import { fr } from "../../i18n/fr.js";
import { ApiError } from "../../lib/api/errors.js";
import { useLogin, useSession } from "../../lib/auth/session.js";
import { email as emailSchema } from "../../lib/forms/schemas.js";
import styles from "./LoginPage.module.css";

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Saisissez votre mot de passe."),
});
type Values = z.infer<typeof schema>;

/// Brand login on cream (UI-07, 05 section 6): 120 px logo with a gold ring,
/// display title, e-mail, password with eye toggle, inline French error.
export function LoginPage() {
  const session = useSession();
  const login = useLogin();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  const next = safeNext(searchParams.get("next"));

  if (session.status === "authenticated") {
    return <Navigate to={next} replace />;
  }

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);

    try {
      await login.mutateAsync(values);
    } catch (error) {
      const copy = describeError(error);
      setFailure(
        error instanceof ApiError && error.status === 429
          ? copy.description
          : error instanceof ApiError && error.isUnauthenticated
            ? "E-mail ou mot de passe incorrect."
            : `${copy.title}. ${copy.description}`,
      );
    }
  });

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="login-title">
        <div className={styles.logoRing}>
          <img
            src="/assets/dar-el-barka-logo.webp"
            alt=""
            width={120}
            height={120}
            className={styles.logo}
          />
        </div>
        <h1 id="login-title" className={styles.title}>
          {fr.appName}
        </h1>
        <p className={styles.subtitle}>{fr.appTagline}</p>
        <form className={styles.form} onSubmit={submit} noValidate>
          {failure ? (
            <p className={styles.failure} role="alert">
              {failure}
            </p>
          ) : null}
          <FormField
            label={fr.email}
            error={form.formState.errors.email?.message}
            required
          >
            <TextInput
              type="email"
              autoComplete="email"
              inputMode="email"
              {...form.register("email")}
            />
          </FormField>
          <FormField
            label={fr.password}
            error={form.formState.errors.password?.message}
            required
          >
            <TextInput
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              suffix={
                <IconButton
                  label={showPassword ? fr.hidePassword : fr.showPassword}
                  icon={showPassword ? <EyeOff /> : <Eye />}
                  size="sm"
                  onClick={() => setShowPassword((value) => !value)}
                />
              }
              {...form.register("password")}
            />
          </FormField>
          <Button type="submit" fullWidth size="lg" loading={login.isPending}>
            {fr.logIn}
          </Button>
        </form>
      </section>
    </main>
  );
}

/// Only same-origin paths may be used as the post-login destination.
export function safeNext(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/connexion")
  ) {
    return "/";
  }

  return value;
}
