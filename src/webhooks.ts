import { WebhookVerificationError } from "./errors";
import type { Batch, Snap } from "./types";

/**
 * The request headers: a `Headers` object (Fetch API, Hono, Next.js) or a
 * plain object (Node.js `IncomingHttpHeaders`, Express).
 */
export type WebhookHeaders =
	| Headers
	| Readonly<Record<string, string | readonly string[] | undefined>>;

/** The options of `verifyWebhook()`. */
export interface VerifyWebhookOptions {
	/**
	 * The raw request body, byte for byte. Do not parse the JSON and encode it
	 * again: the server escapes `/` and non-ASCII characters, so a new
	 * encoding gives other bytes and the signature fails.
	 */
	body: string | Uint8Array | ArrayBuffer;
	headers: WebhookHeaders;
	/** The webhook signing secret of your company, with its `whsec_` prefix. */
	secret: string;
	/** The maximum age of the timestamp, in seconds, before or after now. The default is 300. */
	tolerance?: number;
	/** The current time. Use it in tests. */
	now?: Date;
}

/** `snap.completed`: an async snap rendered. */
export interface SnapCompletedPayload {
	event: "snap.completed";
	snap: Snap;
}

/** `snap.failed`: an async snap did not render. `snap.media_url` is an empty string. */
export interface SnapFailedPayload {
	event: "snap.failed";
	snap: Snap & { status: "failed"; last_error: "render_failed" };
}

/** The counts of a batch in a `snap-import.*` payload. */
export type SnapImportProgress = Omit<Batch, "status_url">;

/** `snap-import.*`: a batch finished, failed or was canceled. */
export interface SnapImportPayload {
	event:
		| "snap-import.completed"
		| "snap-import.failed"
		| "snap-import.canceled";
	import: SnapImportProgress;
	/** The values are `null` when the template no longer exists. */
	template: { uuid: string | null; title: string | null };
}

/**
 * The body of a webhook. A `switch (payload.event)` narrows it. A new server
 * version can send an event that is not in this union, so keep a `default`
 * branch.
 */
export type WebhookPayload =
	| SnapCompletedPayload
	| SnapFailedPayload
	| SnapImportPayload;

/** A webhook that passed verification. */
export interface VerifiedWebhook {
	/**
	 * The value of `X-Snapsbrew-Delivery`. Each attempt of one delivery has
	 * the same ID. Store it to ignore a duplicate. It is `null` when an older
	 * instance sends no delivery header.
	 */
	deliveryId: string | null;
	/** The value of `X-Snapsbrew-Timestamp`, in Unix seconds. */
	timestamp: number;
	/** The decoded body. */
	payload: WebhookPayload;
}

/** The headers of a webhook, in lowercase. */
export const WEBHOOK_HEADERS = {
	delivery: "x-snapsbrew-delivery",
	timestamp: "x-snapsbrew-timestamp",
	signature: "x-snapsbrew-signature",
} as const;

const DEFAULT_TOLERANCE = 300;

/**
 * Verifies a webhook and returns its delivery ID and its payload. Throws a
 * `WebhookVerificationError` with a `reason`:
 *
 * - `signature`: the signature is missing or does not match the body.
 * - `timestamp`: the timestamp is missing, is not Unix seconds, or is more
 *   than `tolerance` seconds from now.
 * - `payload`: the signature is valid, but the body is not a JSON object.
 *
 * Call it only on the server: the secret must stay secret.
 *
 * @example
 * const { deliveryId, payload } = await verifyWebhook({
 * 	body: await request.text(),
 * 	headers: request.headers,
 * 	secret: process.env.SNAPSBREW_WEBHOOK_SECRET,
 * })
 */
export async function verifyWebhook(
	options: VerifyWebhookOptions,
): Promise<VerifiedWebhook> {
	const { secret, tolerance = DEFAULT_TOLERANCE, now = new Date() } = options;

	if (typeof secret !== "string" || secret === "") {
		throw new TypeError("`secret` must be the webhook signing secret.");
	}

	// A tolerance of NaN makes each age check false, so it turns the replay check off.
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new TypeError(
			"`tolerance` must be a number of seconds that is 0 or more.",
		);
	}

	const signature = header(options.headers, WEBHOOK_HEADERS.signature);
	const timestamp = header(options.headers, WEBHOOK_HEADERS.timestamp);
	const deliveryId = header(options.headers, WEBHOOK_HEADERS.delivery);

	if (signature === undefined) {
		throw new WebhookVerificationError(
			"signature",
			"The X-Snapsbrew-Signature header is missing.",
		);
	}

	if (timestamp === undefined || !/^[0-9]+$/.test(timestamp)) {
		throw new WebhookVerificationError(
			"timestamp",
			"The X-Snapsbrew-Timestamp header is missing or is not a number.",
		);
	}

	const body = bytesOf(options.body);

	if (!(await signatureMatches(secret, timestamp, body, signature))) {
		throw new WebhookVerificationError(
			"signature",
			"The signature does not match the body. Check the secret and use the raw body.",
		);
	}

	const age = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));

	if (age > tolerance) {
		throw new WebhookVerificationError(
			"timestamp",
			`The timestamp is ${age} seconds from now. The tolerance is ${tolerance} seconds.`,
		);
	}

	return {
		deliveryId: deliveryId ?? null,
		timestamp: Number(timestamp),
		payload: decodePayload(body),
	};
}

function decodePayload(body: Uint8Array): WebhookPayload {
	let payload: unknown;

	try {
		payload = JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(body),
		);
	} catch {
		payload = undefined;
	}

	if (
		typeof payload !== "object" ||
		payload === null ||
		Array.isArray(payload)
	) {
		throw new WebhookVerificationError(
			"payload",
			"The signature is valid, but the body is not a JSON object.",
		);
	}

	return payload as WebhookPayload;
}

// The server signs `{timestamp}.{body}` with HMAC-SHA256 and sends the
// lowercase hex digest. `subtle.verify` compares the digests in constant time.
async function signatureMatches(
	secret: string,
	timestamp: string,
	body: Uint8Array,
	signature: string,
): Promise<boolean> {
	const hex = signature.toLowerCase();

	if (!/^[0-9a-f]{64}$/.test(hex)) {
		return false;
	}

	const encoder = new TextEncoder();
	const prefix = encoder.encode(`${timestamp}.`);
	const signed = new Uint8Array(prefix.length + body.length);
	signed.set(prefix);
	signed.set(body, prefix.length);

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);

	return crypto.subtle.verify("HMAC", key, hexBytes(hex), signed);
}

/** The trimmed value of a header. An empty value counts as a missing header. */
function header(headers: WebhookHeaders, name: string): string | undefined {
	const value = isHeaders(headers)
		? headers.get(name)
		: objectHeader(headers, name);
	const trimmed = value?.trim();

	return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function objectHeader(
	headers: Exclude<WebhookHeaders, Headers>,
	name: string,
): string | undefined {
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === name) {
			return typeof value === "string" ? value : value?.[0];
		}
	}

	return undefined;
}

// A duck-type check, because a framework can bring its own `Headers` class.
function isHeaders(headers: WebhookHeaders): headers is Headers {
	return typeof (headers as Headers).get === "function";
}

function bytesOf(body: string | Uint8Array | ArrayBuffer): Uint8Array {
	if (typeof body === "string") {
		return new TextEncoder().encode(body);
	}

	return body instanceof Uint8Array ? body : new Uint8Array(body);
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(hex.length / 2);

	for (let index = 0; index < bytes.length; index++) {
		bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}

	return bytes;
}
