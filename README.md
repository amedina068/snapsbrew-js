# snapsbrew

[![CI](https://github.com/amedina068/snapsbrew-js/actions/workflows/ci.yml/badge.svg)](https://github.com/amedina068/snapsbrew-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/amedina068/snapsbrew-js/badge)](https://scorecard.dev/viewer/?uri=github.com/amedina068/snapsbrew-js)

The TypeScript client for a self-hosted [Snapsbrew](https://snapsbrew.com) instance. Snapsbrew renders images ("snaps") from templates.

One package runs on Node.js, Bun, Deno, Cloudflare Workers and other edge runtimes. The package has no runtime dependencies. It uses the global `fetch` and Web Crypto.

> Status: 0.2.0, not released. The package is not on npm yet. Install it from git.

Read the Snapsbrew SDK documentation at [snapsbrew.com/docs/sdks/overview](https://snapsbrew.com/docs/sdks/overview).

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Resources](#resources)
- [Pagination](#pagination)
- [Signed URLs](#signed-urls)
- [Webhooks](#webhooks)
- [Errors](#errors)
- [Retries](#retries)
- [Cancel a call](#cancel-a-call)
- [Framework integration](#framework-integration)
- [Supported runtimes](#supported-runtimes)
- [Related projects](#related-projects)
- [Community](#community)
- [License](#license)

## Install

The package is not on npm yet. Install it from the GitHub repository:

```sh
npm install github:amedina068/snapsbrew-js
```

The `prepare` script builds the package during the install. The build tools need Node.js 22.18 or later. The built package runs on Node.js 20.

For Bun, use `bun add github:amedina068/snapsbrew-js`.

After the release on npm, the install command is `npm install snapsbrew`.

## Quick start

```ts
import { Snapsbrew } from "snapsbrew";

const sb = new Snapsbrew({
	baseUrl: "https://app.snapsbrew.com",
	token: process.env.SNAPSBREW_TOKEN,
});

// A preview returns watermarked HTML. It stores nothing.
const html = await sb.snaps.preview({
	templateId: "044ec825-ee2f-4d06-bb77-98663e27f529",
	variants: [{ layer: "title", text: "Hello" }],
});

// A snap renders the final image and returns its URL.
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
| `token`      | `string`                           | (none)         | An API token with the `api_requests` ability. The SDK sends it as `Authorization: Bearer`. Each API call needs it.    |
| `timeout`    | `number`                           | `60000`        | The time limit for one attempt, in milliseconds.                                                                      |
| `maxRetries` | `number`                           | `2`            | The maximum number of retries after the first attempt. Use `0` to stop retries.                                       |
| `fetch`      | `(url, init) => Promise<Response>` | global `fetch` | A `fetch` function for tests or a proxy.                                                                              |

Each method also accepts `{ signal, timeout, maxRetries }` as its last argument. These values replace the client values for that call.

Keep the token on the server. Do not put the token in a browser bundle.

Only `forms.submit()` works without a token. If the client has no token, each other call throws a `TypeError` before it sends the request.

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
| `sb.forms`       | `submit()`                                                                                                                | `/v1/embedded-forms/{uuid}`     |

The response types keep the field names of the API (`media_url`, `created_at`). The request parameters use camelCase (`templateId`, `webhookUrl`).

Snaps render the published version of a template. After you change a template, call `sb.templates.publish(uuid)`.

`sb.templates.delete(uuid)` also deletes the snaps, images, versions and forms of the template.

### Embedded forms

An embedded form renders a snap from the values that a visitor sends. The form renders on the account of its owner, so the SDK sends no token to the submit URL. A client with no token can submit a form. Copy the submit URL of the form from your instance. The URL carries its own signature.

```ts
const snap = await sb.forms.submit(submitUrl, {
	headline: "Hello",
	photo: file,
});
```

- A string is text. A `Blob` or a `File` is an image.
- A template form uses the layer key, for example `headline`. A collection form uses `{template uuid}__{layer key}` and returns a list of snaps.
- If the signature is not valid, or the form does not exist, `submit()` throws a `NotFoundError`.
- If one IP address or one form sends too many submissions in one minute, `submit()` throws a `RateLimitError` with the `apiCode` `rate_limited`. The SDK retries it.
- The SDK does not retry a submit after a 5xx, because each submit renders a snap.

### Template groups

`templates.create()` and `templates.update()` accept `groups`: the layer groups, in the shape that the editor saves. Each group has an `id`. The fields `name`, `visible`, `collapsed` and `order` are optional. Send `null` to remove the groups.

```ts
await sb.templates.update(uuid, {
	title: "Launch card",
	groups: [{ id: "header", name: "Header", visible: true, order: 0 }],
});
```

### Snap errors

`snap.last_error` is a fixed code, or `null`. The type `SnapErrorCode` lists the codes:

| Code                       | Cause                                                 |
| -------------------------- | ----------------------------------------------------- |
| `render_failed`            | The render failed. The status is `failed`.            |
| `webhook_redirect_refused` | The webhook receiver answered with a redirect.        |
| `webhook_unreachable`      | The server could not connect to the webhook receiver. |
| `webhook_http_<status>`    | The webhook receiver answered with this error status. |

A webhook code can be on a `completed` snap. Then the render worked, but the delivery of the webhook failed. The `last_error` of a batch item is `render_failed` or `null`.

A snap with no file has an empty string as `media_url`.

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

### Screenshots

```ts
const shot = await sb.screenshots.create({
	url: "https://example.com",
	width: 1200,
	height: 630,
});
```

`width` and `height` are 1 to 4000. The server checks them. The SDK does not.

### Media upload

```ts
const file = new Blob([bytes], { type: "image/png" });
const media = await sb.media.upload(file, { filename: "logo.png" });

await sb.snaps.create({
	templateId,
	variants: [{ layer: "logo", image_url: media.src }],
});
```

The server accepts jpg, jpeg, png, gif, webp and bmp files up to 10 MB. It refuses SVG. The server checks the file. The SDK does not.

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

The signing key is not the API token. Make a signing key in the Snapsbrew dashboard. The token of the key must have the `signed_url` ability. The server accepts each active key of the company that owns the template.

The `params` option adds more query parameters to the signature. The names `identifier` and `api_log_uuid` are reserved for the server, so `signedUrl()` refuses them. It also refuses the names that the options set: `template_id`, `variants`, `format`, `transparent` and `signature`.

The algorithm:

1. Take each query parameter except `signature`.
2. Sort the parameters by name in byte order.
3. Join them as `name=value` with `&`. Use the raw values, not the URL-encoded values.
4. Calculate the HMAC-SHA256 of this string with the signing key. Use the lowercase hex digest as `signature`.

`variants` is the standard base64 (with `+`, `/` and `=`) of the JSON array of variants. The server decodes it with the PHP `base64_decode` function, so URL-safe base64 does not work.

## Webhooks

An async snap and a batch post a webhook to their `webhookUrl`. Snapsbrew signs each webhook with the webhook signing secret of your company. Get the secret in **Account > Developers**. It starts with `whsec_`.

`verifyWebhook()` checks the signature and the timestamp. Then it returns the delivery ID and the payload.

WARNING: Verify webhooks only on the server. A webhook secret in browser code lets any person send you false events.

```ts
import { verifyWebhook } from "snapsbrew";

const { deliveryId, timestamp, payload } = await verifyWebhook({
	body: rawBody, // the raw body: a string, a Uint8Array, an ArrayBuffer or a Buffer
	headers: request.headers, // a Headers object or a plain object
	secret: process.env.SNAPSBREW_WEBHOOK_SECRET,
});

switch (payload.event) {
	case "snap.completed":
		console.log(payload.snap.media_url);
		break;
	case "snap.failed":
		console.log(payload.snap.id, payload.snap.last_error); // "render_failed"
		break;
	case "snap-import.completed":
	case "snap-import.failed":
	case "snap-import.canceled":
		console.log(payload.import.uuid, payload.import.completed);
		break;
}
```

Use the raw request body. Do not parse the JSON and encode it again. The server escapes `/` and non-ASCII characters (`\/`, `\u00bf`), so a new encoding gives other bytes and the signature fails.

| Option      | Default      | Description                                                 |
| ----------- | ------------ | ----------------------------------------------------------- |
| `body`      | (required)   | The raw request body.                                       |
| `headers`   | (required)   | The request headers. The names are not case-sensitive.      |
| `secret`    | (required)   | The webhook signing secret, with its `whsec_` prefix.       |
| `tolerance` | `300`        | The maximum distance of the timestamp from now, in seconds. |
| `now`       | `new Date()` | The current time. Use it in tests.                          |

The result has these fields:

- `deliveryId`: the value of `X-Snapsbrew-Delivery`. Each attempt of one delivery has the same ID. Store the ID, and ignore a webhook with an ID that you know. An older instance sends no delivery header. Then the verification passes, and `deliveryId` is `null`.
- `timestamp`: the value of `X-Snapsbrew-Timestamp`, in Unix seconds.
- `payload`: the decoded body. A `switch (payload.event)` narrows its type.

The events are `snap.completed`, `snap.failed`, `snap-import.completed`, `snap-import.failed` and `snap-import.canceled`. A `snap.failed` payload has `status: "failed"`, `last_error: "render_failed"` and an empty `media_url`. A new server version can send a new event, so keep a `default` branch.

If the webhook is not valid, `verifyWebhook()` throws a `WebhookVerificationError`. Answer the request with a 400. Its `reason` tells why. The PHP, Python and Ruby SDKs use the same three reasons:

| `reason`    | Cause                                                                              |
| ----------- | ---------------------------------------------------------------------------------- |
| `signature` | The signature header is missing, or the signature does not match the body.         |
| `timestamp` | The timestamp header is missing, is not Unix seconds, or is outside the tolerance. |
| `payload`   | The signature is valid, but the body is not a JSON object.                         |

The signature is the lowercase hex HMAC-SHA256 of `{X-Snapsbrew-Timestamp}.{raw body}`, with the secret as the key. `verifyWebhook()` changes the received signature to lowercase, then compares it in constant time.

## Errors

Each error that the SDK throws extends `SnapsbrewError` and has a `code`.

| Class                      | `code`                       | Cause                                                                           |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `AuthenticationError`      | `authentication_error`       | 401: the token is missing or not valid.                                         |
| `AuthorizationError`       | `authorization_error`        | 403: the token cannot do this action, or a permission check refused it.         |
| `NotFoundError`            | `not_found`                  | 404: the resource is not in your company. A guide 404 has `available`.          |
| `ConflictError`            | `conflict`                   | 409: the request conflicts with the current state. Read `apiCode`.              |
| `ValidationError`          | `validation_error`           | 422: the server rejected a field. Read `errors` for the messages of each field. |
| `RateLimitError`           | `rate_limit`                 | 429: too many requests. Read `retryAfter` and `limit`.                          |
| `ServerError`              | `server_error`               | 5xx: the server failed.                                                         |
| `ApiError`                 | `api_error`                  | Another error status. Each class above extends `ApiError`.                      |
| `ConnectionError`          | `connection_error`           | The request did not get a response.                                             |
| `TimeoutError`             | `timeout`                    | One attempt took more time than `timeout`.                                      |
| `WebhookVerificationError` | `webhook_verification_error` | `verifyWebhook()` refused a webhook. Read `reason`.                             |

Each `ApiError` has `status`, `body`, `headers`, `requestId` and `apiCode`. `apiCode` is the `code` field of the body, when the body has one. Give the `requestId` to support.

A token without the `api_requests` ability gets a 403 on each call. The SDK throws an `AuthorizationError`.

The message of a 404 can change, for example `No query results for model [...]`. Do not compare it. If `guides.platform()` or `guides.purpose()` gets a key that does not exist, `NotFoundError.available` lists the valid keys:

```ts
try {
	await sb.guides.platform("myspace");
} catch (error) {
	if (error instanceof NotFoundError) console.log(error.available);
}
```

A 422 from `documents.apply()` can have no field errors. Then `ValidationError.errors` is empty, and `apiCode` names the rule, for example `editor_operation_layer_not_found`.

The `apiCode` of a `ConflictError` tells you the cause. The type `ConflictCode` lists the known values:

| `apiCode`                          | Cause                                                        | What to do                                                             |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `idempotency_key_in_progress`      | Another request with the same idempotency key is running.    | Send the request again with the same key. The SDK does this.           |
| `idempotency_key_belongs_to_snap`  | A single snap owns the key. The call was `batches.create()`. | Send a new key.                                                        |
| `idempotency_key_belongs_to_batch` | A batch owns the key. The call was `snaps.create()`.         | Send a new key.                                                        |
| `editor_document_conflict`         | The revision of the editor document moved.                   | Apply the change to `currentDocument`. Send it with `currentRevision`. |
| `legacy_edit_rejected_for_v2`      | The template uses the v2 editor document.                    | Use `sb.documents` to change the template.                             |

For each 409, the server created nothing.

```ts
try {
	await sb.documents.replace(uuid, { revision, document });
} catch (error) {
	if (
		error instanceof ConflictError &&
		error.apiCode === "editor_document_conflict"
	) {
		const next = applyMyChange(error.currentDocument);
		await sb.documents.replace(uuid, {
			revision: error.currentRevision,
			document: next,
		});
	}
}
```

If `snaps.create()` or `batches.create()` fails on the server, the SDK throws a `ServerError` with the `apiCode` `internal_error`. The message does not show the cause. Give the `requestId` to support.

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
		case "conflict":
			if (error.apiCode === "idempotency_key_belongs_to_batch") {
				// Send the request again with a new idempotency key.
			}
			break;
		default:
			throw error;
	}
}
```

If you abort a call with your own `AbortSignal`, the SDK throws the reason of the signal. It does not wrap it.

## Retries

The SDK retries a failed call up to `maxRetries` times (2 by default). The delay doubles on each attempt: 0.5, 1, 2, 4 and 8 seconds at most. Half of each delay is random (jitter). If the server sends `Retry-After`, the SDK waits that time. If `Retry-After` is more than 60 seconds, the SDK does not retry and throws the error. The PHP, Python and Ruby SDKs use the same rules.

| Failure                           | Idempotent call                                            | Other call                                                   |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| 429                               | Yes                                                        | Yes. The server rejected the request before it did the work. |
| 409 `idempotency_key_in_progress` | Only with an `idempotencyKey`. The server created nothing. | No                                                           |
| 5xx                               | Yes                                                        | No                                                           |
| Timeout                           | Yes                                                        | No                                                           |
| Connection refused, DNS error     | Yes                                                        | Yes. The server did not get the request.                     |
| Other connection error            | Yes                                                        | No                                                           |

These calls are idempotent:

- Each `GET` and `DELETE`, for example `templates.delete()`. After a lost response, a retried `templates.delete()` throws a `NotFoundError`, because the first request deleted the template.
- `templates.publish()`, `templates.setTags()` and `batches.cancel()`. A repeat of these calls changes nothing.
- `snaps.create()` and `batches.create()` with an `idempotencyKey`.

The other calls are not idempotent: `templates.create()`, `templates.update()`, `snaps.create()` and `batches.create()` with no key, `screenshots.create()`, `media.upload()`, `tags.create()` and `forms.submit()`. A write to an editor document (`documents.replace()` and `documents.apply()`) is never retried after a 5xx or a timeout, because a repeat gets a conflict.

A repeat of a render makes a second snap. To retry a render safely, send an idempotency key:

```ts
await sb.snaps.create({
	templateId,
	variants,
	idempotencyKey: `order-${order.id}`,
});
```

The server keeps a key for 24 hours. A repeat with the same key returns the first snap and renders nothing. A key belongs to one kind of call. Do not use the key of a single snap for a batch, or the key of a batch for a single snap. The server rejects it with a 409, and the SDK does not retry it.

### Rate limits

The server counts the requests of each user in one minute:

| Endpoints                                   | Limit                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| Each bearer endpoint                        | 60 requests                                                                      |
| `snaps.preview()` and `templates.preview()` | 10 requests, in addition to the limit of 60                                      |
| `sb.documents`                              | 30 requests for one user and 180 for one company, in addition to the limit of 60 |

Over a limit, the server sends a 429 with `Retry-After`. `RateLimitError.limit` is the limit that the request exceeded.

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

### Webhooks in Next.js, Hono or Cloudflare Workers

These frameworks give a Fetch API `Request`. Read the raw body with `request.text()`.

```ts
// app/api/webhooks/snapsbrew/route.ts
import { verifyWebhook, WebhookVerificationError } from "snapsbrew";

export async function POST(request: Request) {
	let webhook;

	try {
		webhook = await verifyWebhook({
			body: await request.text(),
			headers: request.headers,
			secret: process.env.SNAPSBREW_WEBHOOK_SECRET!,
		});
	} catch (error) {
		if (error instanceof WebhookVerificationError) {
			return new Response(error.message, { status: 400 });
		}
		throw error;
	}

	// `deliveryId` is null when an older instance sends no delivery header.
	if (
		webhook.deliveryId !== null &&
		(await alreadyHandled(webhook.deliveryId))
	) {
		return new Response(null, { status: 200 });
	}

	await handle(webhook.payload);

	return new Response(null, { status: 200 });
}
```

### Webhooks in Express

Use `express.raw()` on the webhook route. `express.json()` parses the body, and then the raw bytes are lost.

```ts
import express from "express";
import { verifyWebhook, WebhookVerificationError } from "snapsbrew";

const app = express();

app.post(
	"/webhooks/snapsbrew",
	express.raw({ type: "application/json" }),
	async (req, res) => {
		try {
			const { deliveryId, payload } = await verifyWebhook({
				body: req.body, // a Buffer
				headers: req.headers,
				secret: process.env.SNAPSBREW_WEBHOOK_SECRET!,
			});

			await handleOnce(deliveryId, payload);
			res.sendStatus(200);
		} catch (error) {
			if (error instanceof WebhookVerificationError) {
				res.status(400).send(error.message);
				return;
			}
			throw error;
		}
	},
);
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

## Related projects

- [Snapsbrew](https://github.com/amedina068/snapsbrew): the self-hosted app that this SDK calls. It uses the AGPL-3.0.
- [Documentation](https://snapsbrew.com/docs): the guides for the app and the SDKs. The source is in [snapsbrew-docs](https://github.com/amedina068/snapsbrew-docs).
- [SDK overview](https://snapsbrew.com/docs/sdks/overview): the install steps and the features of each SDK.
- SDKs for other languages: [PHP](https://github.com/amedina068/snapsbrew-php), [Python](https://github.com/amedina068/snapsbrew-python), [Ruby](https://github.com/amedina068/snapsbrew-ruby).

## Community

- [CONTRIBUTING.md](CONTRIBUTING.md): how to set up the code and open a pull request.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): the rules for issues, pull requests, and reviews.
- [SECURITY.md](SECURITY.md): how to report a security problem in private.
- [CHANGELOG.md](CHANGELOG.md): the changes in each version.

Report a problem with the SDK in the issues of this repository. Report a problem with the app in the [Snapsbrew issues](https://github.com/amedina068/snapsbrew/issues).

## License

This SDK is available under the [MIT License](LICENSE). You can use it in closed source code. The Snapsbrew app uses the AGPL-3.0. That license does not cover this SDK.
