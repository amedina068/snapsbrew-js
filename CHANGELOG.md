# Changelog

All notable changes to this project are in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

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

### Fixed

- `screenshots.list()` reads the `image_url` of each item. The server sent a wrong value before.
