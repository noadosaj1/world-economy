"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Button, Field, FormError, FormNotice, TextInput } from "@/components/ui";
import { emptyAuthState, signIn, signUp } from "./actions";

function Submit({ label, busyLabel }: { label: string; busyLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="money" size="lg" disabled={pending} className="w-full">
      {pending ? busyLabel : label}
    </Button>
  );
}

export function CredentialsForm({ mode }: { mode: "signin" | "signup" }) {
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction] = useActionState(action, emptyAuthState);
  const next = useSearchParams().get("next");

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field label="Email">
        <TextInput
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <TextInput
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          minLength={8}
          placeholder="••••••••"
        />
      </Field>

      <FormError message={state.error} />
      <FormNotice message={state.notice} />

      {mode === "signin" ? (
        <Submit label="Sign in" busyLabel="Signing in…" />
      ) : (
        <Submit label="Create account" busyLabel="Creating account…" />
      )}
    </form>
  );
}
