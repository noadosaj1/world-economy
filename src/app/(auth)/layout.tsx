import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 font-[family-name:var(--font-display)] font-black text-white"
        >
          W
        </span>
        <span className="font-[family-name:var(--font-display)] font-bold tracking-wide text-slate-200">
          WORLD ECONOMY
        </span>
      </Link>
      {children}
    </main>
  );
}
