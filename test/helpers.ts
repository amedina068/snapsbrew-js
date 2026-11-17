import { vi } from "vitest";
import { type FetchLike, Snapsbrew, type SnapsbrewOptions } from "../src/index";

export const BASE_URL = "https://snapsbrew.test";
export const TOKEN = "test-token";

/** One mocked reply: a `Response`, or an error that `fetch` throws. */
export type Reply =
	| Response
	| Error
	| (() => Response | Error | Promise<Response>);

/** A JSON response. */
export function json(
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

/** An HTML response. */
export function html(body: string): Response {
	return new Response(body, {
		status: 200,
		headers: { "content-type": "text/html; charset=UTF-8" },
	});
}

/** A `fetch` error like the one undici throws when the connection is refused. */
export function connectionRefused(): TypeError {
	return new TypeError("fetch failed", {
		cause: Object.assign(new Error("connect ECONNREFUSED"), {
			code: "ECONNREFUSED",
		}),
	});
}

/** A `fetch` error like the one undici throws when the server resets the connection. */
export function connectionReset(): TypeError {
	return new TypeError("fetch failed", {
		cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
	});
}

/** Makes a mocked `fetch` that gives the replies in order. */
export function mockFetch(...replies: Reply[]) {
	const queue = [...replies];

	return vi.fn<FetchLike>(async () => {
		const next = queue.shift();

		if (next === undefined) {
			throw new Error("The test made more requests than it expected.");
		}

		const reply = typeof next === "function" ? await next() : next;

		if (reply instanceof Error) {
			throw reply;
		}

		return reply;
	});
}

/** Makes a client with a mocked `fetch`. */
export function client(
	fetch: FetchLike,
	options: Partial<SnapsbrewOptions> = {},
): Snapsbrew {
	return new Snapsbrew({ baseUrl: BASE_URL, token: TOKEN, fetch, ...options });
}

/** The details of one call to the mocked `fetch`. */
export interface Call {
	method: string;
	url: URL;
	headers: Headers;
	body: unknown;
}

/** Reads the call with the given index. */
export function callOf(fetch: ReturnType<typeof mockFetch>, index = 0): Call {
	const call = fetch.mock.calls[index];

	if (call === undefined) {
		throw new Error(`fetch has no call ${index}.`);
	}

	const [url, init] = call;
	const body = init.body;

	return {
		method: init.method ?? "GET",
		url: new URL(url),
		headers: new Headers(init.headers),
		body: typeof body === "string" ? JSON.parse(body) : body,
	};
}
