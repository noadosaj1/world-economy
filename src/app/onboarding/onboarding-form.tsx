"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, FormError, Select, TextInput } from "@/components/ui";
import { INDUSTRIES, INDUSTRY_KEYS } from "@/config/economy";
import { companyNameSchema, tickerSchema, usernameSchema } from "@/lib/validation/onboarding";
import { createCompany, emptyOnboardingState } from "./actions";

/** Suggests a ticker from the company name: "Noa Industries" -> "NOAIN". */
function suggestTicker(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0] ?? "").join("");
  const source = initials.length >= 2 ? initials : name.replace(/[^A-Za-z]/g, "");
  return source.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
}

function fieldError(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, value: string) {
  if (!value) return null;
  const result = schema.safeParse(value);
  return result.success ? null : (result.error?.issues[0]?.message ?? null);
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="money" size="lg" disabled={pending} className="w-full">
      {pending ? "Registering company…" : "Found company & enter the world"}
    </Button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useActionState(createCompany, emptyOnboardingState);

  const [username, setUsername] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [ticker, setTicker] = useState("");
  const [tickerEdited, setTickerEdited] = useState(false);

  const effectiveTicker = tickerEdited ? ticker : suggestTicker(companyName);

  // Inline hints only. The database is what actually enforces these rules.
  const usernameIssue = fieldError(usernameSchema, username);
  const nameIssue = fieldError(companyNameSchema, companyName);
  const tickerIssue = fieldError(tickerSchema, effectiveTicker);

  return (
    <form action={formAction} className="space-y-5">
      <Field label="Username" hint={usernameIssue ?? "3-20 letters, numbers or underscores."}>
        <TextInput
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={20}
          autoComplete="username"
          placeholder="noa"
          aria-invalid={usernameIssue ? true : undefined}
        />
      </Field>

      <Field label="Company name" hint={nameIssue ?? "This is how the world will know you."}>
        <TextInput
          name="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
          maxLength={40}
          placeholder="Noa Industries"
          aria-invalid={nameIssue ? true : undefined}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ticker" hint={tickerIssue ?? "2-5 letters, used on the stock market."}>
          <TextInput
            name="ticker"
            value={effectiveTicker}
            onChange={(e) => {
              setTickerEdited(true);
              setTicker(e.target.value.toUpperCase());
            }}
            required
            maxLength={5}
            placeholder="NOA"
            className="font-[family-name:var(--font-display)] font-bold tracking-widest uppercase"
            aria-invalid={tickerIssue ? true : undefined}
          />
        </Field>

        <Field label="Industry" hint="Pick what you plan to do first.">
          <Select name="industry" defaultValue="agriculture" required>
            {INDUSTRY_KEYS.map((key) => (
              <option key={key} value={key}>
                {INDUSTRIES[key]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <FormError message={state.error} />
      <Submit />
    </form>
  );
}
