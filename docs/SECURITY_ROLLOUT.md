# SETKAPRO security rollout

## Role boundaries

| Role | Allowed changes |
|---|---|
| SUPER_ADMIN, ADMIN, ORGANIZER, SECRETARY | Competition administration: clubs, athletes, registrations, weigh-ins, categories, brackets and match structure/results |
| WEIGH_IN_OPERATOR | Create and update weigh-in records only |
| CHIEF_JUDGE, JUDGE | Update match score, winner, status and penalties. Participant slots may only be populated by validated upstream match progression; clearing a slot requires an audited feeder-result correction (or the valid grand-final reset-final cancellation). Judges cannot manually edit participants, bracket structure or match links. |
| OBSERVER | Read-only access |

All authenticated roles retain read access to the operational tables. Public/anonymous access is not granted by these policies.

## Database rollout

1. Take a Supabase backup or confirm point-in-time recovery is available.
2. Review the target project's migration history. The live project currently reports migrations 007–015, while 001–006 are not represented in that history even though the foundational tables exist. Do not run `supabase db push` or replay the old migrations to repair the history until the missing 001–006 history entries have been reconciled against the actual schema.
3. Confirm the current schema and policies still match the reviewed SETKAPRO project.
4. Apply `supabase/manual/016_role_based_access_control.sql` to the SETKAARM project during a maintenance window. This script is deliberately outside `supabase/migrations` because the live migration history is incomplete.
5. Verify that a JUDGE can update score/penalty fields but receives a permission error when changing athlete slots or bracket links; verify that WEIGH_IN_OPERATOR can write weigh-ins but cannot write athletes/categories/brackets; verify that SECRETARY can administer competition data; verify OBSERVER writes are denied.
6. Keep the previous backup until all role checks and a live tournament workflow have passed.

The migration changes policies and a trigger/function only. It does not delete or rewrite tournament data. It is intentionally not auto-applied by the frontend or deployment workflow.

## CI

The CI workflow runs the TypeScript/Vite production build for pull requests into `main` and pushes to security branches. GitHub Pages deployment remains attached to `main` only.


## Additional database safeguards in 016

- `match_change_log` is append-only for application users: authenticated users retain SELECT, but direct INSERT/UPDATE/DELETE privileges are revoked. The match trigger writes audit records through a fixed-search-path SECURITY DEFINER function.
- `record_match_violation` excludes `WEIGH_IN_OPERATOR`; only competition managers and judges may record match fouls/remarks.
- Judge slot clearing is not authorized merely because a slot currently contains a linked participant. For ordinary feeder links, the latest audit event for that feeder must show its result changed away from the occupant. A reset-final slot can be cleared when the grand-final winner is the winners-bracket champion.
- Before production rollout, explicitly test both directions of result correction in single- and double-elimination brackets, automatic byes, loser-bracket advancement, and both grand-final outcomes. Verify the audit log records each change and cannot be forged through the authenticated API.
