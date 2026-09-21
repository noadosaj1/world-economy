"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, FormError, FormNotice, TextInput } from "@/components/ui";
import { emptyAuthState, signIn, signUp } from "./actions";

/**
 * Email + password form for signing in and signing up.
 *
 * `next` arrives as a prop from the page rather than being read here with
 * useSearchParams(). A client hook that reads the query string cannot run
 * while a page is being statically prerendered unless it sits inside a
 * Suspense boundary - which is what broke a deploy once - and the server
 * already has the value, so it just passes it down.
 *
 * The value is only a hint for redirect-after-login. The server action
 * validates it before trusting it, so it cannot become an open redirect.
 */

function Submit({ label, busyLabel }: { label: string; busyLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="money" size="lg" disabled={pending} className="w-full">
      {pending ? busyLabel : label}
    </Button>
  );
}

export function CredentialsForm({
  mode,
  next,
}: {
  mode: "signin" | "signup";
  next?: string;
}) {
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction] = useActionState(action, emptyAuthState);

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
