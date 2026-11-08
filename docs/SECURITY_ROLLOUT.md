# SETKAPRO security rollout

## Role boundaries

| Role | Allowed changes |
|---|---|
| SUPER_ADMIN, ADMIN, ORGANIZER, SECRETARY | Competition administration: clubs, athletes, registrations, weigh-ins, categories, brackets and match structure/results |
| WEIGH_IN_OPERATOR | Create and update weigh-in records only |
| CHIEF_JUDGE, JUDGE | Update match score, winner, status and penalties; cannot edit athletes, registrations, weigh-ins, categories, bracket structure or match participants/links |
| OBSERVER | Read-only access |

All authenticated roles retain read access to the operational tables. Public/anonymous access is not granted by these policies.

## Database rollout

1. Take a Supabase backup or confirm point-in-time recovery is available.
2. Review the target project's migration history. The live project currently reports migrations 007–015, while 001–006 are not represented in that history even though the foundational tables exist. Do not replay the old migrations to repair the history.
3. Confirm the current schema and policies still match the reviewed SETKAPRO project.
4. Apply `supabase/migrations/016_role_based_access_control.sql` to the SETKAARM project during a maintenance window.
5. Verify that a JUDGE can update score/penalty fields but receives a permission error when changing athlete slots or bracket links; verify that WEIGH_IN_OPERATOR can write weigh-ins but cannot write athletes/categories/brackets; verify that SECRETARY can administer competition data; verify OBSERVER writes are denied.
6. Keep the previous backup until all role checks and a live tournament workflow have passed.

The migration changes policies and a trigger/function only. It does not delete or rewrite tournament data. It is intentionally not auto-applied by the frontend or deployment workflow.

## CI

The CI workflow runs the TypeScript/Vite production build for pull requests into `main` and pushes to security branches. GitHub Pages deployment remains attached to `main` only.
