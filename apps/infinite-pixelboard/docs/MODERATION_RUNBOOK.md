# Pixelboard moderation runbook

This runbook is for authorized Collapse Technologies operators. The `/moderation`
console and every API below require a valid Firebase ID token containing the exact
custom claim `moderator=true`. Never share moderator tokens, evidence exports, or
Firebase account identifiers in public tickets or chat.

## Access provisioning

Provisioning is an offline Admin SDK operation, never a web endpoint. The
maintained command is `npm run provision:pixelboard-moderator`; its exact
dry-run and apply procedure, credential handling, and safety checks are in the
[Pixelboard README](../README.md#provisioning-the-moderator-claim).

For the current production project (`collapse-technologies`), the only approved
operator target is the verified Google account `juanquirinoc@gmail.com`. The
Apple relay account `59v269rgt7@privaterelay.appleid.com` and the App Review
account must not receive this claim. The apply invocation requires the UID
returned by a preceding dry run and an exact email/UID confirmation. If
credentials are unavailable, access remains unprovisioned until an authorized
Firebase administrator runs the command; do not use a broad allowlist or
manually edit production tokens.

## Launch gate

Do not enable advertising or open authenticated placement until all of these are true:

- At least one primary and one backup moderator can sign in and load `/moderation`.
- Report evidence, quarantine, rollback, warning, suspension, and ban actions have
  been exercised in the production environment with test accounts.
- The on-call operator can freeze placements and disable ads independently.
- PostgreSQL backups and the restore procedure have been tested.
- An appeal mailbox owned by Collapse Technologies is monitored.

Keep `Advertising__ModerationOperationsEnabled=false` until this checklist passes.
Keep the emergency ad switch disabled by default in `platform_safety_state`.

## Triage

1. Open the oldest received report and verify its server-captured colors, evidence
   hash, region, and recent attributed placements.
2. Use **Quarantine** first when content may be harmful. Quarantine masks the region
   from public tile snapshots without destroying evidence.
3. Use **Rollback** only for selected placement IDs that are still current. The
   operation restores the previous color and ownership state; verify the affected
   tile afterward.
4. Warn for a first low-severity violation. Suspend for a time-bounded repeated
   violation. Ban only for severe or repeated abuse.
5. Dismiss reports that do not violate the standards. Record a specific reason in
   every action; never put secrets or unnecessary personal data in the reason.

Every action requires a unique idempotency key and is recorded in PostgreSQL before
its effect runs. Repeating the exact command is safe. Reusing the key for different
details is rejected.

## Incident controls

If harmful content is spreading faster than it can be reviewed:

1. Set **placements frozen** in `/moderation`.
2. Set **ads disabled** so advertising is not displayed beside unreviewed content.
3. Confirm placement requests return `board_read_only` and public tiles mask active
   quarantines.
4. Preserve report IDs, action IDs, timestamps, affected coordinates, and relevant
   application logs.
5. Triage, quarantine, and rollback from oldest to newest. Do not modify Redis or
   PostgreSQL manually while automated actions are running.
6. Reopen placements only after a second operator reviews the board and the action
   audit. Re-enable ads separately after the board is safe.

If rollback fails between Redis and PostgreSQL, keep placements frozen and ads
disabled. Capture the failed action ID and logs, then reconcile the tile's current
color and owner against the placement ledger before retrying with a new idempotency
key.

## Appeals

Publish a monitored support address in the app's privacy/support surfaces. Ask an
appellant for the opaque moderation or report reference, their sign-in email, and a
brief explanation. Do not request passwords, Firebase tokens, identity documents,
or payment details.

A moderator who did not make the original decision should review the immutable
evidence and action audit. Record the appeal outcome and rationale in the internal
incident system. Current tooling does not automatically reverse bans, warnings,
quarantines, or rollbacks; approved reversals require a reviewed operational change
and must never delete the original audit or evidence.

## Routine checks

- Review the queue at least daily while placement is open.
- Alert on growing report backlog, failed moderation actions, outbox failures, and
  repeated `board_read_only` responses.
- Verify the placement freeze and ad shutdown controls monthly.
- Restrict the Firebase moderator claim to current operators and remove it
  immediately when access is no longer required.
- Follow the documented retention policy for evidence and account data. Never delete
  records ad hoc during an active report, appeal, or legal hold.
