# S3 backend — deployment guardrails

> Roadmap item **D5**. Stirling-PDF's S3 integration is well-tested *in-repo*, but a secure
> deployment depends on bucket-side configuration the application cannot set for you. This document
> templates the three guardrails that matter — **encryption**, **least-privilege IAM**, and
> **lifecycle/expiry for the transient prefix** — plus credential and endpoint hygiene.
>
> Every claim here is grounded in the code: `app/proprietary/.../cluster/s3/S3FileStore.java`,
> `.../cluster/s3/S3Clients.java`, `.../storage/provider/S3StorageProvider.java`, and the
> `storage.s3.*` block in `ApplicationProperties.java`.

## What writes to the bucket

Two independent consumers share **one** bucket (see `S3FileStore`'s class javadoc):

| Consumer | Purpose | Key layout | S3 operations used |
|----------|---------|------------|--------------------|
| `S3StorageProvider` | **persistent** user files (sharing, etc.) | objects at the bucket root (`storageKey`) | `PutObject`, `GetObject`, `DeleteObject`, presigned `GetObject` |
| `S3FileStore` | **transient** job-result files | namespaced under the `transient/` prefix (`S3FileStore.DEFAULT_KEY_PREFIX`) | `PutObject`, `GetObject`, `HeadObject`, `DeleteObject` |

This split is the key fact for the guardrails below: **only `transient/` is safe to auto-expire** —
the rest of the bucket holds durable user data.

## 1. Encryption at rest (enforce at the bucket — the app does not set it)

The code builds `PutObjectRequest` **without** a `serverSideEncryption(...)` setting (verify:
`S3FileStore.store` and `S3StorageProvider`'s put). Encryption is therefore **not** requested
per-object by the application; it must be guaranteed by the bucket.

- Enable **default encryption** on the bucket so every object is encrypted server-side regardless of
  request headers. SSE-S3 (`AES256`) is the zero-config baseline; SSE-KMS gives you key rotation and
  per-key access control (and then the IAM principal also needs KMS permissions — see §2).

  ```bash
  # SSE-S3 default encryption
  aws s3api put-bucket-encryption --bucket "$BUCKET" \
    --server-side-encryption-configuration '{
      "Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},
                "BucketKeyEnabled":true}]}'
  ```

- Add a **deny-unencrypted / deny-insecure-transport** bucket policy as belt-and-suspenders:

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      { "Sid": "DenyInsecureTransport", "Effect": "Deny", "Principal": "*",
        "Action": "s3:*", "Resource": ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"],
        "Condition": { "Bool": { "aws:SecureTransport": "false" } } }
    ]
  }
  ```

- Turn on **Block Public Access** for the bucket. User file sharing is served via **presigned URLs**
  (the app builds an `S3Presigner`; link lifetime is `storage.s3.linkExpirationDays`, default 3), so
  the bucket itself never needs to be public.

## 2. Least-privilege IAM

**Prefer instance/role credentials over static keys.** `S3Clients.build` uses static
`storage.s3.accessKey`/`secretKey` *only if both are set*; otherwise it falls back to
`DefaultCredentialsProvider` — i.e. an IAM role (EC2 instance profile, ECS task role, or EKS IRSA).
Leave the keys blank in config and attach a role; this avoids long-lived secrets on disk.

Minimal policy grounded in the operations actually issued (no `ListObjects`/`ListBucket` call exists
in either consumer):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "StirlingObjectRW", "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::BUCKET/*" }
  ]
}
```

Notes:
- `HeadObject` (used by `S3FileStore.size`/`exists`) is authorized by **`s3:GetObject`** — no extra
  action needed.
- **Recommended add:** `s3:ListBucket` on `arn:aws:s3:::BUCKET` (resource = the bucket, not `/*`).
  Without it, a `HeadObject` on a missing key returns **403** instead of **404**; the code treats a
  clean 404 as "not found" but logs other errors as warnings, so granting `ListBucket` keeps the
  not-found path quiet and correct.
- **Tighter still** — if you run a *dedicated* bucket for transient files, scope the file-store
  principal to `arn:aws:s3:::BUCKET/transient/*`.
- **SSE-KMS** also requires `kms:GenerateDataKey` and `kms:Decrypt` on the CMK ARN.

## 3. Lifecycle / expiry for `transient/`

Transient job-results are deleted explicitly by `S3FileStore.delete(...)`, but nothing reaps
**orphans** (a crash between `store` and `delete` leaves the object behind). Add a lifecycle rule
**scoped to the `transient/` prefix** so stale transient objects expire automatically — and **never**
apply expiry to the whole bucket, which would delete persistent user files.

```json
{
  "Rules": [
    {
      "ID": "expire-stirling-transient",
      "Filter": { "Prefix": "transient/" },
      "Status": "Enabled",
      "Expiration": { "Days": 1 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --lifecycle-configuration file://transient-lifecycle.json
```

Pick `Days` to comfortably exceed your longest job; 1 day suits typical interactive use. If you
changed the prefix from the `transient/` default, match it here.

## 4. Endpoint & transport hygiene

- **Custom endpoints are SSRF-guarded.** `S3Clients.validateEndpointHost` rejects a
  `storage.s3.endpoint` whose host resolves to a loopback/link-local/private/multicast address
  (blocking, e.g., the `169.254.169.254` metadata service) **unless** you set
  `storage.s3.allow-private-endpoints=true`. Only enable that for trusted in-cluster S3 (MinIO) on a
  private network.
- Always use an **`https://`** endpoint; pair with the `DenyInsecureTransport` policy above.
- `storage.s3.path-style-access=true` is for MinIO / most S3-compatibles; leave `false` for AWS.
- `region` defaults to `us-east-1`; set it to the bucket's real region.

## Configuration reference (`storage.s3.*`)

| Key | Default | Notes |
|-----|---------|-------|
| `bucket` | — | required |
| `region` | `us-east-1` | set to the bucket region |
| `endpoint` | `` (AWS default) | custom/S3-compatible; SSRF-guarded |
| `access-key` / `secret-key` | `` | leave blank to use an IAM role (preferred) |
| `path-style-access` | `false` | `true` for MinIO |
| `allow-private-endpoints` | `false` | opt-in for private/in-cluster endpoints |
| `link-expiration-days` | `3` | presigned share-link lifetime |
| `request-checksum-calculation` / `response-checksum-validation` | `WHEN_SUPPORTED` | lower for older B2/R2/GCS S3 quirks |

## Verifying

These guardrails are bucket/IAM-side and are validated against your cloud account, not the build.
After applying:

```bash
aws s3api get-bucket-encryption --bucket "$BUCKET"
aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET"
aws s3api get-public-access-block --bucket "$BUCKET"
```

The in-repo S3 behaviour (operations, key prefixing, endpoint SSRF guard) is covered by the
`cluster/s3` and `storage/provider` tests under `app/proprietary/src/test/...`.
```
