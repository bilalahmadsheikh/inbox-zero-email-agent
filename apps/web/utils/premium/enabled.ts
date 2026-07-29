// Hard switch for the premium/billing system inherited from the upstream
// Inbox Zero project. There are no premium accounts yet, so this defaults to
// off. Unlike NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS, this isn't a deploy-time env
// var, so it can't silently drift between environments (a missing env var in
// one deploy previously left the dead premium system live and blocked email
// processing for every non-premium account). Flip to true — and configure
// billing — when premium accounts are actually introduced.
export const PREMIUM_ENABLED = false;
