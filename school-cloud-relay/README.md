# E-Class Record School Cloud Relay

This is a school-owned Cloudflare Worker for encrypted E-Class Record backups and
school administration. It uses permanent school-issued personnel activation codes;
there is no Google sign-in or external identity provider.

## Privacy boundary

- Learner records, profile backups, names, contact references, and announcement
  contents are encrypted before they leave the desktop app.
- D1 stores only opaque IDs, roles, hashes, encrypted envelopes, device public keys,
  audit records, and timestamps. R2 stores encrypted profile backup envelopes.
- The activation code is never stored by a desktop app after activation. The relay
  stores only a school-scoped HMAC hash of it.
- The desktop remains the teacher's local working copy. School Cloud is an opt-in
  encrypted backup and multi-device foundation, not a plaintext learner database.

## Roles and activation workflow

1. The ICT Coordinator creates the school-owned Cloudflare account with the school
   DepEd email. The School Head retains recovery access.
2. Guided setup bootstraps the ICT Coordinator and School Head with permanent codes.
3. The ICT Coordinator requests a personnel profile for a teacher, adviser, or
   School Admin. The School Head approves it, or an auditable one-use override key
   is used where school policy permits.
4. Approval reveals the personnel's permanent code once. Deliver it privately.
5. Each code can activate two desktop devices and two Android devices. Revoking or
   resetting a device frees its platform slot; rotating a code invalidates the old one.
6. A pre-existing local profile can remain local or create an encrypted School Cloud
   backup during activation.

## Required bindings and secrets

- `DB`: school-owned D1 database.
- `SNAPSHOTS`: private school-owned R2 bucket.
- `INSTALL_TOKEN`: short-lived guided-setup token; rotate or remove it after setup.
- `SCHOOL_AUTH_SECRET`: a random secret of at least 32 characters for activation
  code and school identity HMACs. `IDENTITY_HMAC_SECRET` is accepted only for a
  temporary migration from older pilot configurations.

Never commit resource IDs, installation tokens, authentication secrets, recovery
keys, or school content keys.

## Setup and validation

1. Create the D1 and R2 resources in the school-owned Cloudflare account.
2. Copy the generated D1 ID into a school-specific `wrangler.toml` (do not commit it).
3. Apply `schema.sql` only to a new pilot database. Existing pilot databases need a
   reviewed D1 migration before deployment because the Google-era tables are removed.
4. Set `INSTALL_TOKEN` and `SCHOOL_AUTH_SECRET` as Worker secrets, deploy, then run
   the protected bootstrap flow from the desktop app.
5. Run `node scripts/test-school-cloud-relay.js` and `npm run test:school-cloud`.

## Pilot guardrails

Use fictional records until deployment migration, Android activation, conflict handling,
recovery drills, monitoring, and independent privacy/security review are complete.
The relay currently verifies signed backup uploads from activated device keys and never
accepts plaintext learner data.
