# Changelog

All notable changes to this project are in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-25

### Added

- `verifyWebhook()` verifies a webhook from Snapsbrew. It checks `X-Snapsbrew-Signature` in constant time and refuses a timestamp more than 300 seconds from now. The `tolerance` option changes the limit.
- `verifyWebhook()` returns `deliveryId`, the value of `X-Snapsbrew-Delivery`. Use it to ignore a duplicate delivery.
- `WebhookVerificationError` with a `reason`: `signature`, `timestamp` or `delivery`.
- Webhook payload types for `snap.completed`, `snap.failed`, `snap-import.completed`, `snap-import.failed` and `snap-import.canceled`.
- `ConflictError.currentDocument` gives the stored document of an `editor_document_conflict`.
- `NotFoundError.available` gives the valid keys when `guides.platform()` or `guides.purpose()` gets a key that does not exist.
- `SnapErrorCode` type for `Snap.last_error`: `render_failed`, `webhook_redirect_refused`, `webhook_unreachable` and `webhook_http_<status>`.
- The `prepare` script builds the package, so `npm install github:amedina068/snapsbrew-js` installs a working package.
- The README has a link to the SDK documentation, a webhook section and the install from git.
- `sb.forms.submit(url, layers)` sends the layers of an embedded form to its signed submit URL, as in the Ruby SDK. A string is text. A `Blob` or a `File` is an image. It sends no token. A template form returns one snap. A collection form returns a list of snaps. A 429 throws a `RateLimitError` with the `apiCode` `rate_limited`, and the SDK retries it. The SDK does not retry a 5xx.
- `token` is optional, the same as in the PHP and Ruby SDKs. A client with no token can call `forms.submit()`. Each other call throws a `TypeError` before the send. An empty token no longer throws in the constructor.
- `WebhookVerificationError.reason` can be `payload`: the signature is valid, but the body is not a JSON object.
- The webhook vectors have the expected `reason` of each invalid case and the `delivery_id` of each valid case.
- The package is under the MIT License. `package.json` has `"license": "MIT"`.

### Changed

- Breaking: a webhook with no `X-Snapsbrew-Delivery` header passes the verification. `deliveryId` is then `null`, so its type is `string | null`. The reason `delivery` is removed. Older instances do not send the header.
- `verifyWebhook()` throws the reason `payload` for a body that is not a JSON object. It was a `SyntaxError` for invalid JSON.
- `verifyWebhook()` treats an empty header as a missing header, and trims each header value.
- The README lists the idempotent calls of the shared list. `templates.setTags()` is in the list, the same as in the code.
- `Snap.last_error` is `SnapErrorCode | null`, not `string | null`. `BatchItem.last_error` is `"render_failed" | null`.
- `templates.create()` accepts `groups: null`, the same as `templates.update()`.
- The README and the comments do not say that a render costs a credit. The server keeps a usage log with no balance.
- The README documents the file types and the size limit of `media.upload()`, and the limits of the screenshot `width` and `height`. The SDK does not check them.
- The README says that a signed URL accepts each active key of the company of the template, and that `templates.delete()` also deletes the snaps, images, versions and forms of the template.
- The Node.js 20 job of the CI installs with `--ignore-scripts`, because the build tools need Node.js 22.18.

## [0.1.0] - Not published

Version 0.1.0 was not published. Release 0.2.0 contains these changes.

### Added

- `Snapsbrew` client with `baseUrl`, `token`, `timeout`, `maxRetries` and a custom `fetch`.
- Resources for the REST API: `account`, `templates`, `documents`, `snaps`, `batches`, `screenshots`, `media`, `tags` and `guides`.
- `signedUrl()` to build signed image URLs with Web Crypto.
- `PagePromise` for lists: `await` one page, or `for await` each item.
- Typed errors with a `code` for each case: authentication, authorization, not found, conflict, validation, rate limit, server, connection and timeout.
- Retries with exponential backoff and jitter. The SDK obeys `Retry-After` and does not retry a request that is not idempotent.
- `AbortSignal` support on each call.
- ESM and CommonJS builds with types for both.
- `ConflictCode` type for the `apiCode` of a `ConflictError`: `idempotency_key_in_progress`, `idempotency_key_belongs_to_snap`, `idempotency_key_belongs_to_batch`, `editor_document_conflict` and `legacy_edit_rejected_for_v2`.
- The SDK retries a 409 `idempotency_key_in_progress` with the normal backoff when the request has an idempotency key. The SDK does not retry the other 409 codes.
- `RateLimitError.limit` gives the value of the `X-RateLimit-Limit` header.
- The README lists the rate limits of the API.

### Changed

- `snaps.create()` gets a 403, not a 401, when a permission check refuses the request. The SDK throws an `AuthorizationError` for it.
- A failed `snaps.create()` gets a 500 with the code `internal_error` and no exception message. The `ServerError` keeps the message, the `apiCode` and the `requestId`.
- `Template.size` and `TemplateWriteResult.size` can be `null`.
- `LayerDefinition.type` is optional.
- `Media` has the nine fields that the server returns: `id`, `uuid`, `name`, `file_name`, `mime_type`, `size`, `original_url`, `src` and `created_at`. The type has no index signature. The server no longer sends `collection_name`, `preview_url`, `updated_at` or the internal fields of the media record.
- `Screenshot.image_url` and `ScreenshotListItem.image_url` are `string | null`. The value is `null`, not an empty string, when the server stored no image.
- A failed `batches.create()` gets a 500 with the code `internal_error`, the same as `snaps.create()`. The `ServerError` keeps the message, the `apiCode` and the `requestId`.

### Fixed

- `screenshots.list()` reads the `image_url` of each item. The server sent a wrong value before.
