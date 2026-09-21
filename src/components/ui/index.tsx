import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* Small, shared building blocks. Kept deliberately plain so feature code
   composes them rather than re-inventing panels and buttons. */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold " +
  "transition-[transform,background-color,box-shadow] duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 " +
  "disabled:cursor-not-allowed disabled:opacity-55 active:translate-y-px";

const BUTTON_VARIANTS = {
  primary:
    "bg-brand-500 text-white shadow-[0_6px_0_0_var(--color-brand-600)] hover:bg-brand-400",
  money:
    "bg-cash-500 text-ink-950 shadow-[0_6px_0_0_var(--color-cash-600)] hover:bg-cash-400",
  ghost: "bg-ink-800/70 text-slate-100 ring-1 ring-inset ring-ink-600 hover:bg-ink-700",
  danger: "bg-danger-500 text-white hover:brightness-110",
} as const;

const BUTTON_SIZES = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
} as const;

type ButtonVariant = keyof typeof BUTTON_VARIANTS;
type ButtonSize = keyof typeof BUTTON_SIZES;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size]);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-ink-700/80 bg-ink-900/70 backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-ink-700/70 px-5 py-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold tracking-wide text-slate-200 uppercase">
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "money" | "brand";
}) {
  const valueTone =
    tone === "money" ? "text-cash-400" : tone === "brand" ? "text-brand-400" : "text-slate-100";
  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-800/50 px-4 py-3">
      <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </div>
      <div
        className={cx(
          "tnum mt-1 font-[family-name:var(--font-display)] text-2xl font-bold",
          valueTone,
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        color ? "" : "bg-ink-700/80 text-slate-200",
        className,
      )}
      style={color ? { backgroundColor: `${color}22`, color } : undefined}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-200">
        {title}
      </h3>
      <p className="max-w-sm text-sm text-slate-400">{body}</p>
      {action}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-sm text-rose-200"
    >
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-xl border border-cash-500/40 bg-cash-500/10 px-3 py-2 text-sm text-lime-200"
    >
      {message}
    </p>
  );
}

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-ink-600 bg-ink-950/60 px-3 text-sm text-slate-100 " +
  "placeholder:text-slate-500 focus:border-brand-400 focus:outline-none";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300 uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(FIELD_CLASS, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(FIELD_CLASS, className)} {...props} />;
}
