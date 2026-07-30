# Future Developments

This document records deferred product ideas that have been reviewed but are not
approved for implementation yet. Items in this document must not be treated as
released features, active subscriptions, or compatibility commitments.

## Detailed Feature Plans

- [Temporary Presentation Viewer and Interactive Noise Meter](future-development-presentation-viewer-noise-meter.md)

## Managed E-Class Cloud Backup and Group Subscription

**Status:** Deferred for future evaluation

**Current free alternative:** Local backup and OneDrive Shared Folder Sync

**Proposed paid alternative:** Managed E-Class Cloud Backup using Cloudflare

### Product direction

- Keep local database saving, manual recovery, and OneDrive synchronization free.
- Offer E-Class Cloud as an optional managed backup and multi-PC synchronization
  service.
- Do not market OneDrive as insecure. Both transports should use the same
  client-side encryption and integrity validation. The managed service would add
  controlled revision storage, device management, server-enforced conflict
  protection, and recovery that does not depend on a user's OneDrive folder.
- Never connect the Electron client directly to a hosted database or include
  administrative database credentials in the application.
- Keep local saving fully functional during cloud outages, subscription expiry,
  or service retirement.

### Proposed subscription

- Introductory price: PHP 100 per year, with PHP 120 to PHP 149 per year retained
  as possible regular pricing after a pilot.
- A PHP 10 monthly option may be evaluated, but annual wallet or QR payments are
  preferred because they require fewer payment events and support requests.
- One subscription would provide three independent cloud-profile slots: the
  buyer's profile and up to two invited teacher profiles.
- Each profile would retain its own Recovery Code, PIN, encryption key, revision
  history, storage quota, and restore points.
- The subscription owner could assign or revoke slots but could never decrypt or
  view an invited teacher's profile.
- Initial fair-use limit: up to three active devices per cloud profile.
- Invitation codes would grant only a subscription slot. They must never contain
  learner data or another profile's encryption key.

### Proposed user experience

1. A teacher chooses **Upgrade to E-Class Cloud** and completes a hosted payment.
2. The app verifies the profile PIN, creates a high-entropy Cloud Recovery Code,
   encrypts the profile locally, and uploads an initial revision.
3. The app downloads and validates that revision before marking cloud backup as
   active.
4. The buyer may create two single-use subscription invitations.
5. An invited teacher activates a separate profile and receives a separate Cloud
   Recovery Code.
6. Another PC connects using the profile's Cloud Recovery Code and PIN, then
   performs the existing detached validation, restore-point, comparison, merge,
   and conflict-review process before synchronization is enabled.

Users would not need Cloudflare, Microsoft, or Google accounts. The payment
provider may require minimal buyer contact information for payment confirmation,
receipts, renewal notices, refunds, and account recovery. Invited teachers would
not need payment accounts.

### Proposed service architecture

- A dedicated Cloudflare Worker would expose a narrow versioned synchronization
  API.
- A dedicated D1 database would store only subscription entitlements, opaque
  profile identifiers, hashed recovery credentials, device registrations,
  revision metadata, synchronization heads, quotas, and deletion state.
- A private R2 bucket would store client-encrypted profile envelopes and
  revisions.
- The cloud synchronization service would use separate resources, secrets,
  deployment configuration, and logs from the existing community and sponsor-ad
  relay.
- All learner names, LRNs, grades, attendance, rosters, assessments, school
  identity, and teacher identity would be encrypted before leaving the PC.
- The server would enforce request-size limits, rate limits, replay protection,
  idempotency, device revocation, bounded retention, and compare-and-swap
  publication of revisions.
- Provider and protocol versions would be independent from the root learner
  database schema so that local and OneDrive compatibility can be retained.

### Subscription expiry and data safety

- Subscription expiry must never lock the teacher out of the local app or local
  records.
- Local and OneDrive saving would continue normally.
- Cloud synchronization would enter a read-only grace period instead of deleting
  data immediately.
- The initial proposal is a 60-day download and renewal grace period, followed by
  another explicit warning and a short recoverable deletion period.
- Revoking a shared slot would use the same grace process.
- Service retirement would require an encrypted bulk-export path and a
  sufficiently long migration window.

### Preliminary cost model for 1,000 cloud profiles

Planning assumptions:

- 1,000 actively synchronized profiles.
- Cloudflare Workers Paid at USD 5 per month.
- D1 holds metadata only and R2 holds encrypted snapshots.
- Normal synchronization requests remain inside the included Workers, D1, and R2
  operation allowances.
- PHP 61.40 per USD is used only as a planning conversion.
- Stored size includes the current revision, device heads, and retained restore
  points.

| Average total stored per profile | Total R2 storage | Estimated monthly infrastructure | Estimated annual infrastructure |
| ---: | ---: | ---: | ---: |
| 25 MB | 25 GB | PHP 321 | PHP 3,850 |
| 100 MB | 100 GB | PHP 390 | PHP 4,679 |
| 250 MB | 250 GB | PHP 528 | PHP 6,336 |

At maximum three-profile sharing, 1,000 paid cloud profiles would require 334
subscription groups.

| Scenario | Annual amount |
| --- | ---: |
| Gross revenue at PHP 100 per group | PHP 33,400 |
| Approximate GCash processing cost including VAT on the fee | PHP 834 |
| Estimated Cloudflare infrastructure | PHP 3,850 to PHP 6,336 |
| Remaining before tax, support, development, monitoring, and compliance | PHP 26,230 to PHP 28,716 |

If only 25% of 1,000 app users adopt cloud backup, approximately 84 fully shared
subscription groups would produce PHP 8,400 gross annual revenue. The service is
therefore expected to cover basic infrastructure before it can fund meaningful
support or continued development.

These figures are estimates, not a pricing commitment. Real profile sizes,
synchronization frequency, payment fees, exchange rates, taxes, support demand,
and provider pricing must be measured and reviewed immediately before a pilot.

### Payment implementation considerations

- Use a hosted checkout from a Philippine payment provider such as PayMongo or
  Xendit.
- Prefer GCash, Maya, or QR Ph for low-value annual payments.
- Do not collect card or wallet credentials inside the Electron application.
- Verify signed payment webhooks before granting an entitlement.
- Maintain a payment ledger and idempotent webhook processing separate from
  learner data.
- Do not use a low-value card payment without reviewing its fixed transaction
  fee.
- Complete merchant registration, invoicing, tax, refund, privacy, and consumer
  protection requirements before accepting payments.

### Privacy and advertising boundaries

- Complete a privacy-impact assessment and processor review before any real
  learner data is uploaded.
- Provide a clear cloud-processing notice and require deliberate opt-in.
- Document retention, deletion, breach response, support access, cross-border
  processing, and service-retirement procedures.
- Cloudflare's APAC location is a location hint and must not be described as
  guaranteed Philippine-only storage.
- Subscription records and payment contact information must remain separate from
  encrypted learner records.
- Advertising must never use learner data, school identity, grade level, backup
  activity, or subscription-sharing relationships for targeting.
- No advertisement may block backup, restore, conflict review, or access to local
  records.

### Required phase gates before implementation

1. Measure real compressed profile sizes locally without uploading their content.
2. Complete the threat model, privacy-impact assessment, retention policy, and
   service-retirement plan.
3. Confirm current Cloudflare and payment-provider pricing.
4. Specify and test the versioned cloud protocol and cryptographic test vectors.
5. Build isolated staging resources and a synthetic-data service pilot.
6. Run corruption, replay, wrong-PIN, concurrent-device, quota, outage, rollback,
   future-schema, and legacy-profile tests.
7. Complete a limited user pilot and validate costs before public sales.

### Reference pricing reviewed during planning

- Cloudflare Workers pricing:
  https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare D1 pricing and limits:
  https://developers.cloudflare.com/d1/platform/pricing/
  and https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare R2 pricing:
  https://developers.cloudflare.com/r2/pricing/
- Cloudflare D1 data-location behavior:
  https://developers.cloudflare.com/d1/configuration/data-location/
- PayMongo pricing:
  https://www.paymongo.com/pricing
