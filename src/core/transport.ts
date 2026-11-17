import {
	type ApiError,
	ConnectionError,
	createApiError,
	RateLimitError,
	ServerError,
	type SnapsbrewError,
	SnapsbrewError as SnapsbrewErrorClass,
	TimeoutError,
} from "../errors";
import { appendQuery, type QueryParams } from "./query";

/** A `fetch` function. The global `fetch` is the default. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The settings of one call. Each field overrides the client setting. */
export interface RequestOptions {
	/** Cancels the call, also during a retry delay. */
	signal?: AbortSignal;
	/** The time limit for one attempt, in milliseconds. */
	timeout?: number;
	/** The maximum number of retries after the first attempt. */
	maxRetries?: number;
}

export interface TransportOptions {
	baseUrl: string | URL;
	token: string;
	timeout: number;
	maxRetries: number;
	fetch: FetchLike | undefined;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestSpec {
	method: HttpMethod;
	/** The path after `/api`, for example `/v1/templates`. */
	path: string;
	query?: QueryParams;
	/** A JSON body. */
	json?: unknown;
	/** A multipart body. */
	form?: FormData;
	/**
	 * `true` when a repeat of the request has no extra effect. The default
	 * is `true` for GET, PUT and DELETE, and `false` for POST and PATCH.
	 */
	idempotent?: boolean;
	/** Read the body as text, not as JSON. */
	text?: boolean;
}

const IDEMPOTENT_METHODS: ReadonlySet<HttpMethod> = new Set([
	"GET",
	"PUT",
	"DELETE",
]);

const INITIAL_RETRY_DELAY = 500;
const MAX_RETRY_DELAY = 8000;
/** The SDK does not wait longer than this for a `Retry-After` value. */
const MAX_RETRY_AFTER = 60_000;

/** Sends requests to one Snapsbrew instance, with time limits and retries. */
export class Transport {
	readonly #apiRoot: string;
	readonly #token: string;
	readonly #timeout: number;
	readonly #maxRetries: number;
	readonly #fetch: FetchLike;

	constructor(options: TransportOptions) {
		this.#apiRoot = `${instanceRoot(options.baseUrl)}/api`;
		this.#token = options.token;
		this.#timeout = options.timeout;
		this.#maxRetries = options.maxRetries;
		// Resolve the global `fetch` on each call. A runtime can replace it after
		// the client exists, and a detached `fetch` throws in some runtimes.
		this.#fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
	}

	/** Sends one request and returns the parsed body. */
	async request<T>(
		spec: RequestSpec,
		options: RequestOptions = {},
	): Promise<T> {
		const url = this.#url(spec);
		const init = this.#init(spec);
		const maxRetries = options.maxRetries ?? this.#maxRetries;
		const idempotent = spec.idempotent ?? IDEMPOTENT_METHODS.has(spec.method);

		for (let attempt = 0; ; attempt++) {
			let failure: SnapsbrewError;

			try {
				return (await this.#attempt(url, init, spec, options)) as T;
			} catch (error) {
				if (!(error instanceof SnapsbrewErrorClass)) {
					throw error;
				}

				failure = error;
			}

			const delay =
				attempt < maxRetries
					? retryDelay(failure, attempt, idempotent)
					: undefined;

			if (delay === undefined) {
				throw failure;
			}

			await sleep(delay, options.signal);
		}
	}

	async #attempt(
		url: string,
		init: RequestInit,
		spec: RequestSpec,
		options: RequestOptions,
	): Promise<unknown> {
		const { signal } = options;
		signal?.throwIfAborted();

		const controller = new AbortController();
		const abort = (): void => controller.abort(signal?.reason);
		signal?.addEventListener("abort", abort, { once: true });

		let timedOut = false;
		const timeout = options.timeout ?? this.#timeout;
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeout);

		try {
			const response = await this.#fetch(url, {
				...init,
				signal: controller.signal,
			});
			const raw = await response.text();

			if (!response.ok) {
				throw createApiError(response.status, parseBody(raw), response.headers);
			}

			if (spec.text === true) {
				return raw;
			}

			return raw === "" ? undefined : parseJson(raw, response);
		} catch (error) {
			if (error instanceof SnapsbrewErrorClass) {
				throw error;
			}

			if (signal?.aborted === true) {
				throw signal.reason;
			}

			if (timedOut) {
				throw new TimeoutError(`The request took more than ${timeout} ms.`, {
					cause: error,
				});
			}

			throw new ConnectionError(
				`The request to ${spec.method} ${spec.path} failed: ${describe(error)}`,
				{
					cause: error,
				},
			);
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
		}
	}

	#url(spec: RequestSpec): string {
		const url = new URL(this.#apiRoot + spec.path);

		if (spec.query !== undefined) {
			appendQuery(url.searchParams, spec.query);
		}

		return url.href;
	}

	#init(spec: RequestSpec): RequestInit {
		const headers: Record<string, string> = {
			accept:
				spec.text === true ? "text/html, application/json" : "application/json",
			authorization: `Bearer ${this.#token}`,
		};

		if (spec.form !== undefined) {
			return { method: spec.method, headers, body: spec.form };
		}

		if (spec.json !== undefined) {
			headers["content-type"] = "application/json";

			return { method: spec.method, headers, body: JSON.stringify(spec.json) };
		}

		return { method: spec.method, headers };
	}
}

/**
 * Returns the delay before the next attempt, or `undefined` when the SDK must
 * not retry. A request that is not idempotent gets a retry only when the
 * server did not process it: a 429, or a connection that never opened.
 */
export function retryDelay(
	failure: SnapsbrewError,
	attempt: number,
	idempotent: boolean,
	random: () => number = Math.random,
): number | undefined {
	const retryable =
		failure instanceof RateLimitError ||
		(failure instanceof ConnectionError &&
			(idempotent || failure.beforeSend)) ||
		(idempotent &&
			(failure instanceof ServerError || failure.code === "timeout"));

	if (!retryable) {
		return undefined;
	}

	const retryAfter =
		failure instanceof RateLimitError || failure instanceof ServerError
			? retryAfterOf(failure)
			: undefined;

	if (retryAfter !== undefined) {
		return retryAfter <= MAX_RETRY_AFTER ? retryAfter : undefined;
	}

	const base = Math.min(MAX_RETRY_DELAY, INITIAL_RETRY_DELAY * 2 ** attempt);

	// Equal jitter: half of the delay is fixed, the other half is random.
	return base / 2 + random() * (base / 2);
}

function retryAfterOf(error: ApiError): number | undefined {
	const seconds =
		error instanceof RateLimitError ? error.retryAfter : undefined;

	if (seconds !== undefined) {
		return Math.ceil(seconds * 1000);
	}

	const header = error.headers.get("retry-after");

	return header !== null && /^\d+$/.test(header.trim())
		? Number(header.trim()) * 1000
		: undefined;
}

/** Waits `ms` milliseconds. An abort of `signal` rejects with the reason of the signal. */
export function sleep(
	ms: number,
	signal: AbortSignal | undefined,
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted === true) {
			reject(signal.reason);
			return;
		}

		const onAbort = (): void => {
			clearTimeout(timer);
			reject(signal?.reason);
		};

		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);

		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function instanceRoot(baseUrl: string | URL): string {
	let url: URL;

	try {
		url = new URL(baseUrl);
	} catch {
		throw new TypeError(
			"`baseUrl` must be an absolute URL, for example `https://app.snapsbrew.com`.",
		);
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new TypeError("`baseUrl` must use http or https.");
	}

	return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function parseBody(raw: string): unknown {
	if (raw === "") {
		return undefined;
	}

	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function parseJson(raw: string, response: Response): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		throw createApiError(
			response.status,
			{
				message:
					"The server sent a body that is not JSON. Make sure that `baseUrl` is the root URL of the instance.",
			},
			response.headers,
		);
	}
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
