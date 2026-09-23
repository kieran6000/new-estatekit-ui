#!/usr/bin/env bash
# Deploys the edge functions that are waiting on a release.
# Requires the Supabase CLI to be logged in first:  npx supabase login
set -euo pipefail

PROJECT_REF=yfcnsvrhojpysrzqrkdi

# Functions that must ship together with the pending migrations.
FUNCTIONS=(
  sync-fb-leads        # Facebook quota: page-token cache, backoff, fewer polls
  get-fb-form          # shares the page-token cache + honours the backoff
  list-fb-forms        # same
  public-submit-lead   # stores lead quality + ad attribution
  fb-capi-lead         # Conversions API (new)
  daily-stage-nudge    # end-of-day nudge, gated on the Automations toggle
)

for fn in "${FUNCTIONS[@]}"; do
  echo "--- deploying $fn"
  npx --yes supabase functions deploy "$fn" \
    --project-ref "$PROJECT_REF" \
    --no-verify-jwt \
    --use-api
done

echo
echo "All ${#FUNCTIONS[@]} functions deployed."
