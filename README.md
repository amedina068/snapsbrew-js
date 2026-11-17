# snapsbrew

The TypeScript client for a self-hosted [Snapsbrew](https://snapsbrew.com) instance. Snapsbrew renders images ("snaps") from templates.

One package runs on Node.js, Bun, Deno, Cloudflare Workers and other edge runtimes. The package has no runtime dependencies. It uses the global `fetch` and Web Crypto.

> Status: 0.1.0, not released. The package is not on npm yet.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Resources](#resources)
- [Pagination](#pagination)
- [Signed URLs](#signed-urls)
- [Errors](#errors)
- [Retries](#retries)
- [Cancel a call](#cancel-a-call)
- [Framework integration](#framework-integration)
- [Supported runtimes](#supported-runtimes)

## Install

```sh
npm install snapsbrew
```

For Bun, use `bun add snapsbrew`. For Deno, import `npm:snapsbrew`.

## Quick start

```ts
import { Snapsbrew } from "snapsbrew";

const sb = new Snapsbrew({
	baseUrl: "https://app.snapsbrew.com",
	token: process.env.SNAPSBREW_TOKEN,
});

// A preview is free. It returns watermarked HTML.
const html = await sb.snaps.preview({
	templateId: "044ec825-ee2f-4d06-bb77-98663e27f529",
	variants: [{ layer: "title", text: "Hello" }],
});

// A snap costs one credit. It returns the URL of the final image.
const snap = await sb.snaps.create({
	templateId: "044ec825-ee2f-4d06-bb77-98663e27f529",
	variants: [{ layer: "title", text: "Hello" }],
});

console.log(snap.media_url);
```

A variant names a layer key and sets one property. Get the layer keys of a template with `sb.templates.get(uuid)`. The properties are `text`, `image_url`, `background_color`, `qr_content`, `barcode_content` and `hidden`. The type of a variant rejects an object that sets two properties.

## Configuration

| Option       | Type                               | Default        | Description                                                                                                           |
| ------------ | ---------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`    | `string \| URL`                    | (required)     | The root URL of your instance. The SDK adds `/api`. Each user runs their own instance, so the SDK has no default URL. |
| `token`      | `string`                           | (required)     | An API token with the `api_requests` ability. The SDK sends it as `Authorization: Bearer`.                            |
| `timeout`    | `number`                           | `60000`        | The time limit for one attempt, in milliseconds.                                                                      |
| `maxRetries` | `number`                           | `2`            | The maximum number of retries after the first attempt. Use `0` to stop retries.                                       |
| `fetch`      | `(url, init) => Promise<Response>` | global `fetch` | A `fetch` function for tests or a proxy.                                                                              |

Each method also accepts `{ signal, timeout, maxRetries }` as its last argument. These values replace the client values for that call.

Keep the token on the server. Do not put the token in a browser bundle.

## Resources

| Property         | Methods                                                                                                                   | Endpoint                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `sb.account`     | `get()`                                                                                                                   | `/v1/auth`                      |
| `sb.templates`   | `list()`, `get()`, `sizes()`, `create()`, `update()`, `delete()`, `publish()`, `preview()`, `setTags()`                   | `/v1/templates`                 |
| `sb.documents`   | `get()`, `replace()`, `apply()`, `preflight()`                                                                            | `/v1/templates/{uuid}/document` |
| `sb.snaps`       | `create()`, `preview()`                                                                                                   | `/v1/snaps`                     |
| `sb.batches`     | `create()`, `get()`, `cancel()`, `wait()`                                                                                 | `/v1/snaps/batches`             |
| `sb.screenshots` | `list()`, `get()`, `create()`                                                                                             | `/v1/screenshots`               |
| `sb.media`       | `list()`, `upload()`                                                                                                      | `/v1/media`                     |
| `sb.tags`        | `list()`, `create()`                                                                                                      | `/v1/tags`                      |
| `sb.guides`      | `design()`, `layers()`, `variantProperties()`, `editorDocument()`, `platforms()`, `platform()`, `purposes()`, `purpose()` | `/v1/guides`                    |

The response types keep the field names of the API (`media_url`, `created_at`). The request parameters use camelCase (`templateId`, `webhookUrl`).

Snaps render the published version of a template. After you change a template, call `sb.templates.publish(uuid)`.

### Batches

```ts
const batch = await sb.batches.create({
	templateId,
	items: rows.map((row) => ({
		identifier: row.id,
		variants: [{ layer: "title", text: row.title }],
	})),
});

const done = await sb.batches.wait(batch.uuid, {
	signal: AbortSignal.timeout(300_000),
});

for (const item of done.items) {
	console.log(item.identifier, item.status, item.media_url);
}
```

A batch has 1 to 100 items. `wait()` reads the batch every 5 seconds until the status is `completed`, `failed` or `canceled`.

### Media upload

```ts
const file = new Blob([bytes], { type: "image/png" });
const media = await sb.media.upload(file, { filename: "logo.png" });

await sb.snaps.create({
	templateId,
	variants: [{ layer: "logo", image_url: media.src }],
});
```

## Pagination

`sb.templates.list()`, `sb.screenshots.list()` and `sb.media.list()` return a `PagePromise`.

- Use `await` to get one page with its raw body.
- Use `for await` to get each item of each page. The SDK loads the next page only when the loop needs it.
- Use `.pages()` to get each page.
- Use `.toArray()` to get all items in one array. Use it only for short lists.

```ts
const firstPage = await sb.templates.list();
console.log(firstPage.meta.next_cursor);

for await (const template of sb.templates.list()) {
	console.log(template.uuid, template.title);
}
```

## Signed URLs

A signed URL renders an image with no API call. Put it in an `<img src>` or in an `og:image` tag. The same input always gives the same URL. The server renders the image one time and then serves the cached file.

```ts
import { signedUrl } from "snapsbrew";

const url = await signedUrl({
	baseUrl: "https://app.snapsbrew.com",
	key: process.env.SNAPSBREW_SIGNING_KEY,
	templateId: "044ec825-ee2f-4d06-bb77-98663e27f529",
	variants: [{ layer: "title", text: "Hello" }],
	format: "webp", // optional: "png" (default), "jpeg" or "webp"
});
```

WARNING: Sign URLs only on the server. A signing key in browser code lets any person render images on your account.

The signing key is not the API token. Make a signing key in the Snapsbrew dashboard. The token of the key must have the `signed_url` ability.

The algorithm:

1. Take each query parameter except `signature`.
2. Sort the parameters by name in byte order.
3. Join them as `name=value` with `&`. Use the raw values, not the URL-encoded values.
4. Calculate the HMAC-SHA256 of this string with the signing key. Use the lowercase hex digest as `signature`.

`variants` is the standard base64 (with `+`, `/` and `=`) of the JSON array of variants. The server decodes it with the PHP `base64_decode` function, so URL-safe base64 does not work.

## Errors

Each error that the SDK throws extends `SnapsbrewError` and has a `code`.

| Class                 | `code`                 | Cause                                                                           |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| `AuthenticationError` | `authentication_error` | 401: the token is missing or not valid.                                         |
| `AuthorizationError`  | `authorization_error`  | 403: the token cannot do this action.                                           |
| `NotFoundError`       | `not_found`            | 404: the resource is not in your company.                                       |
| `ConflictError`       | `conflict`             | 409: an idempotency key is in use, or the revision of a document moved.         |
| `ValidationError`     | `validation_error`     | 422: the server rejected a field. Read `errors` for the messages of each field. |
| `RateLimitError`      | `rate_limit`           | 429: too many requests. Read `retryAfter` for the seconds to wait.              |
| `ServerError`         | `server_error`         | 5xx: the server failed.                                                         |
| `ApiError`            | `api_error`            | Another error status. Each class above extends `ApiError`.                      |
| `ConnectionError`     | `connection_error`     | The request did not get a response.                                             |
| `TimeoutError`        | `timeout`              | One attempt took more time than `timeout`.                                      |

Each `ApiError` has `status`, `body`, `headers` and `requestId`. Give the `requestId` to support.

Use `instanceof`, or use `isSnapsbrewError()` and a `switch` on `code`. The `switch` narrows the type:

```ts
import { isSnapsbrewError } from "snapsbrew";

try {
	await sb.snaps.create({ templateId, variants });
} catch (error) {
	if (!isSnapsbrewError(error)) throw error;

	switch (error.code) {
		case "validation_error":
			console.error(error.errors);
			break;
		case "rate_limit":
			console.error(`Wait ${error.retryAfter} seconds.`);
			break;
		default:
			throw error;
	}
}
```

If you abort a call with your own `AbortSignal`, the SDK throws the reason of the signal. It does not wrap it.

## Retries

The SDK retries a failed call up to `maxRetries` times. The delay doubles on each attempt: 0.5, 1, 2, 4 and 8 seconds at most. Half of each delay is random (jitter). If the server sends `Retry-After`, the SDK waits that time. If `Retry-After` is more than 60 seconds, the SDK does not retry and throws a `RateLimitError`.

| Failure                       | Retry of GET, PUT, DELETE | Retry of POST, PATCH                                         |
| ----------------------------- | ------------------------- | ------------------------------------------------------------ |
| 429                           | Yes                       | Yes. The server rejected the request before it did the work. |
| 5xx                           | Yes                       | Only with an `idempotencyKey`                                |
| Timeout                       | Yes                       | Only with an `idempotencyKey`                                |
| Connection refused, DNS error | Yes                       | Yes. The server did not get the request.                     |
| Other connection error        | Yes                       | Only with an `idempotencyKey`                                |

A render costs a credit. To retry a render safely, send an idempotency key:

```ts
await sb.snaps.create({
	templateId,
	variants,
	idempotencyKey: `order-${order.id}`,
});
```

The server keeps a key for 24 hours. A repeat with the same key returns the first snap and renders nothing. The SDK also retries `batches.cancel()` and `templates.publish()`, because a repeat of these calls changes nothing. The SDK does not retry a write to an editor document, because a repeat gets a conflict.

## Cancel a call

Each method accepts an `AbortSignal`. The signal also stops a retry delay.

```ts
const templates = await sb.templates.list(
	{},
	{ signal: AbortSignal.timeout(5000) },
);
```

## Framework integration

### `og:image` in a server route

Sign the URL on the server and put it in the page head. This example uses Hono on Cloudflare Workers. The same code runs in a Next.js server component, an Astro page or an Express route.

```ts
import { Hono } from "hono";
import { signedUrl } from "snapsbrew";

type Env = {
	SNAPSBREW_URL: string;
	SNAPSBREW_SIGNING_KEY: string;
	OG_TEMPLATE_ID: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/posts/:slug", async (c) => {
	const post = await loadPost(c.req.param("slug"));
	const image = await signedUrl({
		baseUrl: c.env.SNAPSBREW_URL,
		key: c.env.SNAPSBREW_SIGNING_KEY,
		templateId: c.env.OG_TEMPLATE_ID,
		variants: [{ layer: "title", text: post.title }],
	});

	return c.html(`<head><meta property="og:image" content="${image}"></head>`);
});
```

### A custom `fetch`

Use the `fetch` option for a proxy, for logs, or for tests:

```ts
const sb = new Snapsbrew({
	baseUrl,
	token,
	fetch: (url, init) => {
		console.log(init.method, url);
		return fetch(url, init);
	},
});
```

## Supported runtimes

| Runtime            | Version              | Test in CI                                            |
| ------------------ | -------------------- | ----------------------------------------------------- |
| Node.js            | 20, 22, 24 and later | Unit tests and smoke test                             |
| Bun                | 1.x                  | Smoke test                                            |
| Deno               | 2.x                  | Smoke test                                            |
| Cloudflare Workers | Current              | None. The SDK uses only Web APIs that Workers supply. |

The package ships ESM (`dist/index.js`) and CommonJS (`dist/index.cjs`), with types for both.

Node.js 20 is out of support since April 2026. The SDK still tests on it.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, read [SECURITY.md](SECURITY.md).
