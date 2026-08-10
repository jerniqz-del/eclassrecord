# Cloud Grade Submission Pilot

This package deploys one school-owned Cloudflare Worker with one D1 database.
It does not use R2 and does not require a paid Workers plan or payment method.

The Worker is only a temporary encrypted delivery service for validated Grade
Transfer payloads. Teachers never sign in to Cloudflare.

## 1. Create the school resources

Use the school-controlled Cloudflare account and install Node.js on the ICT
computer. From this project folder:

```powershell
npx wrangler login
npx wrangler d1 create eclassrecord-grade-pilot
```

Copy `wrangler.toml.example` to `wrangler.toml`, then replace
`REPLACE_WITH_D1_DATABASE_ID` with the ID printed by the create command.

Initialize the remote database:

```powershell
npx wrangler d1 execute eclassrecord-grade-pilot --remote --file cloud-grade-pilot/schema.sql
```

Create a long random administrator secret and store it in Cloudflare. Do not
put the value in `wrangler.toml` or send it to teachers.

```powershell
npx wrangler secret put ADMIN_SETUP_TOKEN --config cloud-grade-pilot/wrangler.toml
npx wrangler deploy --config cloud-grade-pilot/wrangler.toml
```

Open `https://YOUR-WORKER.workers.dev/health`. A successful installation
returns `storage: "d1-only"`.

## 2. Register the school

The following PowerShell example uses the administrator secret only on the ICT
computer:

```powershell
$worker = "https://YOUR-WORKER.workers.dev"
$adminSecret = Read-Host "Cloud administrator secret"
$headers = @{ Authorization = "Bearer $adminSecret" }

Invoke-RestMethod -Method Post -Uri "$worker/v1/admin/schools" `
  -Headers $headers -ContentType "application/json" `
  -Body (@{
    schoolId = "SCHOOL-ID"
    name = "Pilot School"
    retentionDays = 30
  } | ConvertTo-Json)
```

## 3. Create an adviser

```powershell
$body = @{
  schoolId = "SCHOOL-ID"
  displayName = "Adviser Name"
  role = "adviser"
  assignments = @(
    @{ schoolYear = "2026-2027"; gradeLevel = "7"; section = "Rizal" }
  )
} | ConvertTo-Json -Depth 5

$result = Invoke-RestMethod -Method Post -Uri "$worker/v1/admin/users" `
  -Headers $headers -ContentType "application/json" -Body $body
$result.activationCode
```

Give the displayed activation code privately to that adviser. It expires after
14 days and works once.

## 4. Create a subject teacher

The `subjectKey` must match the normalized subject key in a Grade Transfer
payload, such as `MATHEMATICS` or `SCIENCE`.

```powershell
$body = @{
  schoolId = "SCHOOL-ID"
  displayName = "Subject Teacher Name"
  role = "subject-teacher"
  assignments = @(
    @{
      schoolYear = "2026-2027"
      gradeLevel = "7"
      section = "Rizal"
      subjectKey = "MATHEMATICS"
    }
  )
} | ConvertTo-Json -Depth 5

$result = Invoke-RestMethod -Method Post -Uri "$worker/v1/admin/users" `
  -Headers $headers -ContentType "application/json" -Body $body
$result.activationCode
```

Repeat with the correct assignments for each teacher. Never reuse or publicly
post an activation code.

## 5. Disable access or issue a replacement code

Keep the user ID returned during registration. To immediately disable a user
and invalidate that user's sessions:

```powershell
Invoke-RestMethod -Method Post -Uri "$worker/v1/admin/users/USER-ID/status" `
  -Headers $headers -ContentType "application/json" `
  -Body (@{ status = "disabled" } | ConvertTo-Json)
```

After verifying the person's identity, issue a new one-time code. This removes
the previous device key and sessions, so submissions encrypted for the old key
must be resent by the subject teacher.

```powershell
$result = Invoke-RestMethod -Method Post `
  -Uri "$worker/v1/admin/users/USER-ID/activation-code" -Headers $headers
$result.activationCode
```

## 6. Connect each app profile

In E-Class Record, open **Settings > School Grade Submission**. Enter the
Worker address and that person's one-time activation code. The generated
private device key stays inside the protected local profile; only its public
key is sent to the Worker.

Subject teachers use **Export Final Grades > Submit to Adviser**. Advisers use
**Advisory Class > Online Grade Inbox** and still complete the normal import
preview before grades are saved locally.

## 7. Pilot operations

- Start with fictional learners, one subject teacher, and one adviser.
- Keep offline Grade Transfer Files available during the pilot.
- D1 deletes submissions after the school's retention period, 30 days by
  default. Local records and backups remain authoritative.
- Free-plan limits stop requests rather than creating automatic overage bills.
- Before production, add an ICT administration screen, session revocation,
  rate limiting, monitoring, and a documented privacy review.
