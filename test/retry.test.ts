import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryDelay } from "../src/core/transport";
import {
	ConnectionError,
	NotFoundError,
	RateLimitError,
	ServerError,
	TimeoutError,
} from "../src/index";
import {
	client,
	connectionRefused,
	connectionReset,
	json,
	mockFetch,
} from "./helpers";

const ACCOUNT = {
	data: { email: "dev@example.com", name: "Ada", company: null },
};
const SNAP = { id: "9f1c2d3e", status: "completed" };

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

/** Starts a call, runs each timer, and returns the result or the error. */
async function settle<T>(promise: Promise<T>): Promise<T | unknown> {
	const result = promise.catch((error: unknown) => error);
	await vi.runAllTimersAsync();

	return result;
}

/** Makes the next call of `fetch` wait until the SDK aborts it. */
function hangOnce(fetch: ReturnType<typeof mockFetch>): void {
	fetch.mockImplementationOnce(
		(_url, init) =>
			new Promise<Response>((_resolve, reject) => {
				init.signal?.addEventListener("abort", () =>
					reject(new Error("aborted")),
				);
			}),
	);
}

describe("retries of an idempotent request", () => {
	it("retries a 5xx and then succeeds", async () => {
		const fetch = mockFetch(
			json(500, { message: "Server Error" }),
			json(503, {}),
			json(200, ACCOUNT),
		);

		const result = await settle(client(fetch).account.get());

		expect(result).toEqual(ACCOUNT.data);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("retries a connection error", async () => {
		const fetch = mockFetch(connectionReset(), json(200, ACCOUNT));

		expect(await settle(client(fetch).account.get())).toEqual(ACCOUNT.data);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("stops after maxRetries and throws the last error", async () => {
		const fetch = mockFetch(
			json(500, {}),
			json(502, {}),
			json(503, { message: "Down" }),
		);

		const error = await settle(client(fetch, { maxRetries: 2 }).account.get());

		expect(error).toBeInstanceOf(ServerError);
		expect(error).toMatchObject({ status: 503, message: "Down" });
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("does not retry when maxRetries is 0", async () => {
		const fetch = mockFetch(json(500, {}));

		expect(
			await settle(client(fetch, { maxRetries: 0 }).account.get()),
		).toBeInstanceOf(ServerError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("lets one call override maxRetries", async () => {
		const fetch = mockFetch(json(500, {}), json(200, ACCOUNT));

		expect(
			await settle(
				client(fetch, { maxRetries: 0 }).account.get({ maxRetries: 1 }),
			),
		).toEqual(ACCOUNT.data);
	});

	it("does not retry a 4xx other than 429", async () => {
		const fetch = mockFetch(json(404, { message: "Not found." }));

		expect(await settle(client(fetch).account.get())).toBeInstanceOf(
			NotFoundError,
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("retries a timeout", async () => {
		const fetch = mockFetch(json(200, ACCOUNT));
		hangOnce(fetch);

		expect(
			await settle(client(fetch, { timeout: 1000 }).account.get()),
		).toEqual(ACCOUNT.data);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});

describe("retries of a request that is not idempotent", () => {
	const params = {
		templateId: "t-1",
		variants: [{ layer: "title", text: "Hi" }],
	} as const;

	it("does not retry a 5xx", async () => {
		const fetch = mockFetch(json(500, {}));

		expect(await settle(client(fetch).snaps.create(params))).toBeInstanceOf(
			ServerError,
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("does not retry a reset connection", async () => {
		const fetch = mockFetch(connectionReset());

		expect(await settle(client(fetch).snaps.create(params))).toBeInstanceOf(
			ConnectionError,
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("does not retry a timeout", async () => {
		const fetch = mockFetch();
		hangOnce(fetch);

		expect(
			await settle(client(fetch, { timeout: 1000 }).snaps.create(params)),
		).toBeInstanceOf(TimeoutError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("retries a refused connection, because the server did not get the request", async () => {
		const fetch = mockFetch(connectionRefused(), json(201, SNAP));

		expect(await settle(client(fetch).snaps.create(params))).toEqual(SNAP);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("retries a 429", async () => {
		const fetch = mockFetch(
			json(429, { message: "Too Many Attempts." }),
			json(201, SNAP),
		);

		expect(await settle(client(fetch).snaps.create(params))).toEqual(SNAP);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("retries a 5xx when the call has an idempotency key", async () => {
		const fetch = mockFetch(json(503, {}), json(201, SNAP));

		expect(
			await settle(
				client(fetch).snaps.create({ ...params, idempotencyKey: "order-42" }),
			),
		).toEqual(SNAP);
		expect(fetch).toHaveBeenCalledTimes(2);

		const bodies = fetch.mock.calls.map(([, init]) =>
			JSON.parse(String(init.body)),
		);
		expect(bodies[0].idempotency_key).toBe("order-42");
		expect(bodies[1]).toEqual(bodies[0]);
	});

	it("retries a batch cancel, because a cancel is safe to repeat", async () => {
		const fetch = mockFetch(
			json(500, {}),
			json(200, { uuid: "b-1", status: "canceled", items: [] }),
		);

		expect(await settle(client(fetch).batches.cancel("b-1"))).toMatchObject({
			status: "canceled",
		});
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});

describe("Retry-After", () => {
	it("waits for the time in Retry-After", async () => {
		const fetch = mockFetch(
			json(429, {}, { "retry-after": "3" }),
			json(200, ACCOUNT),
		);
		const promise = client(fetch).account.get();

		await vi.advanceTimersByTimeAsync(2999);
		expect(fetch).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(await promise).toEqual(ACCOUNT.data);
	});

	it("reads Retry-After on a 503", async () => {
		const fetch = mockFetch(
			json(503, {}, { "retry-after": "2" }),
			json(200, ACCOUNT),
		);
		const promise = client(fetch).account.get();

		await vi.advanceTimersByTimeAsync(1999);
		expect(fetch).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);
		expect(await promise).toEqual(ACCOUNT.data);
	});

	it("does not wait for a Retry-After of more than 60 seconds", async () => {
		const fetch = mockFetch(json(429, {}, { "retry-after": "120" }));

		const error = await settle(client(fetch).account.get());

		expect(error).toBeInstanceOf(RateLimitError);
		expect((error as RateLimitError).retryAfter).toBe(120);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe("abort", () => {
	it("stops the retry delay when the signal aborts", async () => {
		const fetch = mockFetch(json(500, {}), json(200, ACCOUNT));
		const controller = new AbortController();
		const promise = client(fetch)
			.account.get({ signal: controller.signal })
			.catch((error: unknown) => error);

		await vi.advanceTimersByTimeAsync(10);
		controller.abort(new Error("stop"));

		expect(await promise).toMatchObject({ message: "stop" });
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe("retryDelay()", () => {
	const serverError = new ServerError(500, {}, new Headers());

	it("doubles the delay on each attempt, up to 8 seconds", () => {
		const max = () => 0.999_999;
		const delays = [0, 1, 2, 3, 4, 5].map((attempt) =>
			Math.round(retryDelay(serverError, attempt, true, max) ?? -1),
		);

		expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 8000]);
	});

	it("adds jitter: half of the delay is random", () => {
		expect(retryDelay(serverError, 1, true, () => 0)).toBe(500);
		expect(retryDelay(serverError, 1, true, () => 0.5)).toBe(750);
	});

	it("gives no delay for an error that must not be retried", () => {
		expect(retryDelay(serverError, 0, false)).toBeUndefined();
		expect(
			retryDelay(new NotFoundError(404, {}, new Headers()), 0, true),
		).toBeUndefined();
	});
});
