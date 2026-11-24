import type { EditorDocumentBody } from "./types";

/** The `code` of each error class. Use it in a `switch` to narrow the error. */
export type SnapsbrewErrorCode =
	| "authentication_error"
	| "authorization_error"
	| "not_found"
	| "conflict"
	| "validation_error"
	| "rate_limit"
	| "server_error"
	| "api_error"
	| "connection_error"
	| "timeout"
	| "webhook_verification_error";

/**
 * The base class of every error that the SDK throws. An abort from your own
 * `AbortSignal` is not wrapped: the SDK throws the reason of the signal.
 */
export abstract class SnapsbrewError extends Error {
	abstract readonly code: SnapsbrewErrorCode;
	override name = "SnapsbrewError";
}

/** The `code` of each error that has an HTTP response. */
export type ApiErrorCode = Exclude<
	SnapsbrewErrorCode,
	"connection_error" | "timeout" | "webhook_verification_error"
>;

/** The server sent a response with an error status. */
export class ApiError extends SnapsbrewError {
	readonly code: ApiErrorCode = "api_error";
	override name = "ApiError";
	/** The HTTP status code. */
	readonly status: number;
	/** The parsed JSON body, or the text body when it is not JSON. */
	readonly body: unknown;
	/** The response headers. */
	readonly headers: Headers;
	/** The value of the `X-Request-Uuid` header. Give it to support. */
	readonly requestId: string | undefined;
	/** The `code` field of the body, for example `editor_document_conflict`. */
	readonly apiCode: string | undefined;

	constructor(status: number, body: unknown, headers: Headers) {
		super(messageOf(status, body));
		this.status = status;
		this.body = body;
		this.headers = headers;
		this.requestId = headers.get("x-request-uuid") ?? undefined;
		this.apiCode = stringField(body, "code");
	}
}

/** 401: the token is missing, not valid, or expired. */
export class AuthenticationError extends ApiError {
	override readonly code = "authentication_error" as const;
	override name = "AuthenticationError";
}

/**
 * 403: the token cannot do this action. The token has no `api_requests`
 * ability, or a permission check refused the request.
 */
export class AuthorizationError extends ApiError {
	override readonly code = "authorization_error" as const;
	override name = "AuthorizationError";
}

/**
 * 404: the resource does not exist in your company. The message text can
 * change, so do not compare it.
 */
export class NotFoundError extends ApiError {
	override readonly code = "not_found" as const;
	override name = "NotFoundError";
	/**
	 * The valid keys, when `guides.platform()` or `guides.purpose()` gets a
	 * key that does not exist.
	 */
	readonly available: readonly string[] | undefined;

	constructor(status: number, body: unknown, headers: Headers) {
		super(status, body, headers);
		const available = isRecord(body) ? body.available : undefined;
		this.available = Array.isArray(available)
			? available.filter((key): key is string => typeof key === "string")
			: undefined;
	}
}

/**
 * The `code` field of a 409 body. A new server version can send a code that is
 * not in this list.
 *
 * - `idempotency_key_in_progress`: another request holds the idempotency key.
 *   A repeat with the same key is safe. The SDK retries it.
 * - `idempotency_key_belongs_to_snap`: a single snap owns the key. Send a new key.
 * - `idempotency_key_belongs_to_batch`: a batch owns the key. Send a new key.
 * - `editor_document_conflict`: the revision of the editor document moved.
 * - `legacy_edit_rejected_for_v2`: the template uses the v2 editor document.
 *   Use `documents` to change it.
 */
export type ConflictCode =
	| "idempotency_key_in_progress"
	| "idempotency_key_belongs_to_snap"
	| "idempotency_key_belongs_to_batch"
	| "editor_document_conflict"
	| "legacy_edit_rejected_for_v2";

/**
 * 409: the request conflicts with the current state. Read `apiCode` to know
 * the cause. The server created nothing.
 */
export class ConflictError extends ApiError {
	override readonly code = "conflict" as const;
	override name = "ConflictError";
	/** The `code` field of the body. See `ConflictCode`. */
	declare readonly apiCode: ConflictCode | (string & {}) | undefined;
	/** The stored revision, when an editor document write conflicts. */
	readonly currentRevision: number | undefined;
	/**
	 * The stored document, when an editor document write conflicts. Apply
	 * your change to it, then send it with `currentRevision`.
	 */
	readonly currentDocument: EditorDocumentBody | undefined;

	constructor(status: number, body: unknown, headers: Headers) {
		super(status, body, headers);
		const revision = isRecord(body) ? body.current_revision : undefined;
		const document = isRecord(body) ? body.current_document : undefined;
		this.currentRevision = typeof revision === "number" ? revision : undefined;
		this.currentDocument = isRecord(document)
			? (document as EditorDocumentBody)
			: undefined;
	}
}

/**
 * 422: the server rejected one or more fields. An editor document operation
 * that the document rejects has no field errors. Then `apiCode` names the
 * rule, for example `editor_operation_layer_not_found`.
 */
export class ValidationError extends ApiError {
	override readonly code = "validation_error" as const;
	override name = "ValidationError";
	/**
	 * The messages for each field, for example `{ 'variants.0.image_url': ['...'] }`.
	 * The object is empty when the body has no `errors`.
	 */
	readonly errors: Readonly<Record<string, readonly string[]>>;

	constructor(status: number, body: unknown, headers: Headers) {
		super(status, body, headers);
		this.errors = fieldErrorsOf(body);
	}
}

/** 429: too many requests. */
export class RateLimitError extends ApiError {
	override readonly code = "rate_limit" as const;
	override name = "RateLimitError";
	/** The number of seconds from the `Retry-After` header, when the server sent it. */
	readonly retryAfter: number | undefined;
	/**
	 * The number of requests in one minute that the exceeded limit allows,
	 * from the `X-RateLimit-Limit` header. A preview has a limit of 10.
	 */
	readonly limit: number | undefined;

	constructor(status: number, body: unknown, headers: Headers) {
		super(status, body, headers);
		this.retryAfter = parseRetryAfter(headers.get("retry-after"));
		this.limit = parseCount(headers.get("x-ratelimit-limit"));
	}
}

/**
 * 5xx: the server failed. A failed `POST /v1/snaps` or `POST /v1/snaps/batches`
 * has the `apiCode` `internal_error`. Give the `requestId` to support.
 */
export class ServerError extends ApiError {
	override readonly code = "server_error" as const;
	override name = "ServerError";
}

/** The request did not get a response: DNS, TLS, a refused or reset connection. */
export class ConnectionError extends SnapsbrewError {
	readonly code = "connection_error" as const;
	override name = "ConnectionError";
	/**
	 * `true` when the SDK knows that the server did not receive the request,
	 * for example when the connection was refused. Then a retry is safe.
	 */
	readonly beforeSend: boolean;

	constructor(message: string, options: { cause: unknown }) {
		super(message, options);
		this.beforeSend = isBeforeSend(options.cause);
	}
}

/** The request took more time than the `timeout` setting. */
export class TimeoutError extends SnapsbrewError {
	readonly code = "timeout" as const;
	override name = "TimeoutError";
}

/** The reason that `verifyWebhook()` refused a request. */
/** The same three reasons as in the PHP, Python and Ruby SDKs. */
export type WebhookFailureReason = "signature" | "timestamp" | "payload";

/**
 * `verifyWebhook()` refused a request. Read `reason` to learn why. Answer the
 * request with a 400.
 */
export class WebhookVerificationError extends SnapsbrewError {
	readonly code = "webhook_verification_error" as const;
	override name = "WebhookVerificationError";
	/**
	 * `signature`: the signature is missing or does not match.
	 * `timestamp`: the timestamp is missing, is not Unix seconds, or is
	 * outside the tolerance.
	 * `payload`: the signature is valid, but the body is not a JSON object.
	 */
	readonly reason: WebhookFailureReason;

	constructor(reason: WebhookFailureReason, message: string) {
		super(message);
		this.reason = reason;
	}
}

/** Makes the error class that matches an HTTP status. */
export function createApiError(
	status: number,
	body: unknown,
	headers: Headers,
): ApiError {
	switch (status) {
		case 401:
			return new AuthenticationError(status, body, headers);
		case 403:
			return new AuthorizationError(status, body, headers);
		case 404:
			return new NotFoundError(status, body, headers);
		case 409:
			return new ConflictError(status, body, headers);
		case 422:
			return new ValidationError(status, body, headers);
		case 429:
			return new RateLimitError(status, body, headers);
		default:
			return status >= 500
				? new ServerError(status, body, headers)
				: new ApiError(status, body, headers);
	}
}

/** Reads a `Retry-After` value (seconds or an HTTP date) as seconds. */
export function parseRetryAfter(
	value: string | null,
	now: number = Date.now(),
): number | undefined {
	if (value === null) {
		return undefined;
	}

	const trimmed = value.trim();

	if (/^\d+$/.test(trimmed)) {
		return Number(trimmed);
	}

	const date = Date.parse(trimmed);

	return Number.isNaN(date) ? undefined : Math.max(0, (date - now) / 1000);
}

function parseCount(value: string | null): number | undefined {
	const trimmed = value?.trim();

	return trimmed !== undefined && /^\d+$/.test(trimmed)
		? Number(trimmed)
		: undefined;
}

// The codes that a runtime gives when the connection never opened. Node
// (undici) puts them on `cause.code`. Bun puts them on `code`.
const BEFORE_SEND_CODES = new Set([
	"ECONNREFUSED",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"UND_ERR_CONNECT_TIMEOUT",
	"ConnectionRefused",
	"FailedToOpenSocket",
]);

function isBeforeSend(error: unknown): boolean {
	for (
		let current = error, depth = 0;
		isRecord(current) && depth < 4;
		depth++
	) {
		if (
			typeof current.code === "string" &&
			BEFORE_SEND_CODES.has(current.code)
		) {
			return true;
		}

		current = current.cause;
	}

	return false;
}

function messageOf(status: number, body: unknown): string {
	return (
		stringField(body, "message") ??
		stringField(body, "code") ??
		(typeof body === "string" && body.length > 0 && body.length <= 200
			? body
			: `HTTP ${status}`)
	);
}

function fieldErrorsOf(body: unknown): Record<string, readonly string[]> {
	const errors = isRecord(body) ? body.errors : undefined;
	const result: Record<string, readonly string[]> = {};

	if (!isRecord(errors)) {
		return result;
	}

	for (const [field, messages] of Object.entries(errors)) {
		result[field] = Array.isArray(messages)
			? messages.filter(
					(message): message is string => typeof message === "string",
				)
			: typeof messages === "string"
				? [messages]
				: [];
	}

	return result;
}

function stringField(body: unknown, field: string): string | undefined {
	const value = isRecord(body) ? body[field] : undefined;

	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Each error that the SDK throws, as a discriminated union on `code`. A
 * `switch (error.code)` narrows the union to one class.
 */
export type AnySnapsbrewError =
	| AuthenticationError
	| AuthorizationError
	| NotFoundError
	| ConflictError
	| ValidationError
	| RateLimitError
	| ServerError
	| (ApiError & { readonly code: "api_error" })
	| ConnectionError
	| TimeoutError
	| WebhookVerificationError;

/**
 * Returns `true` for each error that the SDK throws. Use it in a `catch`
 * block, then narrow the error with `switch (error.code)`.
 */
export function isSnapsbrewError(error: unknown): error is AnySnapsbrewError {
	return error instanceof SnapsbrewError;
}
