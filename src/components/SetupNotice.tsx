import { Panel, PanelHeader } from "@/components/ui";

/**
 * Shown instead of the game when Supabase credentials are missing, so a fresh
 * clone explains itself rather than throwing.
 */
export function SetupNotice() {
  return (
    <Panel className="w-full">
      <PanelHeader title="Finish setup" hint="World Economy needs a Supabase project." />
      <div className="space-y-4 p-5 text-sm text-slate-300">
        <p>
          The game stores every player, company, plot and transaction in Postgres. Point
          it at a Supabase project to get started:
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-slate-400">
          <li>
            Copy <code className="rounded bg-ink-800 px-1.5 py-0.5 text-slate-200">.env.example</code>{" "}
            to <code className="rounded bg-ink-800 px-1.5 py-0.5 text-slate-200">.env.local</code>{" "}
            and fill in your project URL and anon key.
          </li>
          <li>
            Apply the migrations in{" "}
            <code className="rounded bg-ink-800 px-1.5 py-0.5 text-slate-200">
              supabase/migrations
            </code>{" "}
            in filename order.
          </li>
          <li>Restart the dev server.</li>
        </ol>
        <p className="text-slate-500">
          See <code className="rounded bg-ink-800 px-1.5 py-0.5 text-slate-200">README.md</code>{" "}
          for the full walkthrough.
        </p>
      </div>
    </Panel>
  );
}
