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
