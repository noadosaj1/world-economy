"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, cx } from "@/components/ui";
import { emptyActionResult, type ActionResult } from "@/services/economy/form-state";

/**
 * A one-button form wired to an economy action.
 *
 * Every action gets the same three states - idle, working, result - so no
 * button in the game leaves the player wondering whether it did anything.
 * The result text comes from the server, because the server is what decided
 * the outcome.
 */

type Variant = "primary" | "money" | "ghost" | "danger";

function Submit({
  label,
  busyLabel,
  variant,
  size,
  disabled,
  className,
}: {
  label: string;
  busyLabel: string;
  variant: Variant;
  size: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || disabled}
      className={className}
    >
      {pending ? busyLabel : label}
    </Button>
  );
}

export function ActionForm({
  action,
  label,
  busyLabel = "Working…",
  variant = "primary",
  size = "sm",
  disabled,
  hidden,
  className,
  children,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  label: string;
  busyLabel?: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Values posted with the action, e.g. which building. */
  hidden?: Record<string, string>;
  className?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, emptyActionResult);

  return (
    <form action={formAction} className={cx("space-y-1.5", className)}>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {children}

      <Submit
        label={label}
        busyLabel={busyLabel}
        variant={variant}
        size={size}
        disabled={disabled}
      />

      {state.success ? (
        <p role="status" className="tnum text-xs font-semibold text-cash-400">
          {state.success}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-xs font-medium text-rose-300">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
