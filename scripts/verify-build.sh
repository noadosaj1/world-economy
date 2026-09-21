#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Builds the app twice, because it has two genuinely different render paths
# and only building one of them hides real failures.
#
#   1. UNCONFIGURED - no Supabase credentials. Pages render the setup notice.
#   2. CONFIGURED   - placeholder credentials. Pages render the real UI.
#
# A Vercel build failed exactly here once: /login renders the sign-in form
# only when Supabase is configured, and that form used a client hook that is
# illegal during static prerendering. Building without credentials never
# reached the form, so the build passed locally and failed on deploy.
#
# Shell environment takes precedence over .env files in Next, so this works
# without touching a developer's .env.local.
# ---------------------------------------------------------------------------
set -euo pipefail

run_build() {
  local label="$1"
  shift
  echo ""
  echo "=============================================================="
  echo "  Building: $label"
  echo "=============================================================="
  rm -rf .next
  if env "$@" npm run build; then
    echo "  ✓ $label build succeeded"
  else
    echo "  ✗ $label build FAILED" >&2
    exit 1
  fi
}

run_build "unconfigured (no Supabase credentials)" \
  NEXT_PUBLIC_SUPABASE_URL= \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=

run_build "configured (placeholder Supabase credentials)" \
  NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key

echo ""
echo "Both build paths succeeded."
