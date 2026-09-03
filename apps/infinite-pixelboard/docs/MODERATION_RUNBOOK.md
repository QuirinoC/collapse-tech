# Pixelboard moderation runbook

This runbook is for authorized Collapse Technologies operators. The `/moderation`
page is an authentication-gated client shell, and every API below requires a valid
Firebase ID token containing the exact custom claim `moderator=true`. Never share
moderator tokens, evidence exports, or Firebase account identifiers in public
tickets or chat.

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

## Special codes

Moderators can create multi-user promotional codes that grant a temporary paint boost
(including `cooldownSeconds: 0` for unlimited placing until the benefit expires). Special
codes are redeemable even after an account has already used a referral invite. Each
account may redeem a given special code only once.

Create codes via `POST /api/v1/moderation/special-codes` (requires a Firebase ID token with
`moderator=true`). Prefer the API over raw SQL so validation and audits stay consistent.
`cooldownSeconds` is `0`–`10` (`0` = unlimited placing). Provide
`benefitDurationSeconds` and/or `benefitExpiresAt`. Optional `codeExpiresAt` stops new
redemptions after that instant. Codes are 4–16 characters from the invite alphabet
(`A–Z` / `2–9`, no `I`/`O`/`0`/`1`). Omit `code` to auto-generate one.

Unlimited placing for 24 hours after each redemption:

```bash
TOKEN='<firebase-id-token-with-moderator-claim>'
curl -sS -X POST \
  'https://pixelboard.collapsetechnologies.com/api/v1/moderation/special-codes' \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "code": "PAINTNOW",
    "cooldownSeconds": 0,
    "benefitDurationSeconds": 86400,
    "note": "influencer unlimited drop"
  }'
```

Custom cooldown (1s) until a hard expiry, with a redemption window:

```bash
curl -sS -X POST \
  'https://pixelboard.collapsetechnologies.com/api/v1/moderation/special-codes' \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "code": "FAST1S",
    "cooldownSeconds": 1,
    "benefitExpiresAt": "2026-12-31T23:59:59Z",
    "codeExpiresAt": "2026-10-01T00:00:00Z",
    "note": "event 1s cooldown through Dec"
  }'
```

Users redeem with `POST /api/v1/account/special-code` (`{"code":"PAINTNOW"}`) while signed
in — web Account panel “Redeem a special code”, or iOS Account → code field (special codes
tried first, then referral). Each account may redeem a given code only once.

Emergency SQL (prefer API). Alphabet and constraints must match migration `013_special_codes`:

```sql
INSERT INTO pixelboard.special_codes (
  code, cooldown_seconds, code_expires_at, benefit_duration_seconds, benefit_expires_at, note)
VALUES (
  'PAINTNOW', 0, NULL, 86400, NULL, 'manual unlimited drop');
```

Apply migration `013_special_codes` with `--provision-postgres` before creating codes in
production (already done when `/health/ready` reports Healthy with special_codes tables).

## Routine checks

- Review the queue at least daily while placement is open.
- Alert on growing report backlog, failed moderation actions, outbox failures, and
  repeated `board_read_only` responses.
- Verify the placement freeze and ad shutdown controls monthly.
- Restrict the Firebase moderator claim to current operators and remove it
  immediately when access is no longer required.
- Follow the documented retention policy for evidence and account data. Never delete
  records ad hoc during an active report, appeal, or legal hold.
