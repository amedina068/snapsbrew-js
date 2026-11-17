import { describe, expect, it, vi } from "vitest";
import { parseRetryAfter } from "../src/errors";
import {
	ApiError,
	AuthenticationError,
	AuthorizationError,
	ConflictError,
	ConnectionError,
	type FetchLike,
	isSnapsbrewError,
	NotFoundError,
	RateLimitError,
	ServerError,
	SnapsbrewError,
	TimeoutError,
	ValidationError,
} from "../src/index";
import {
	client,
	connectionRefused,
	connectionReset,
	json,
	mockFetch,
} from "./helpers";

async function errorFor(response: Response | Error): Promise<unknown> {
	const sb = client(mockFetch(response), { maxRetries: 0 });

	return sb.account.get().then(
		() => {
			throw new Error("The call did not fail.");
		},
		(error: unknown) => error,
	);
}

describe("HTTP errors", () => {
	const cases = [
		[
			401,
			AuthenticationError,
			"authentication_error",
			{ message: "Unauthenticated." },
		],
		[
			403,
			AuthorizationError,
			"authorization_error",
			{ message: "Invalid ability provided." },
		],
		[404, NotFoundError, "not_found", { message: "Not found." }],
		[
			409,
			ConflictError,
			"conflict",
			{
				message: "A request with this idempotency_key is already in progress.",
			},
		],
		[
			422,
			ValidationError,
			"validation_error",
			{ message: "The name field is required.", errors: {} },
		],
		[429, RateLimitError, "rate_limit", { message: "Too Many Attempts." }],
		[500, ServerError, "server_error", { message: "Server Error" }],
		[503, ServerError, "server_error", { message: "Service Unavailable" }],
		[418, ApiError, "api_error", { message: "I'm a teapot" }],
	] as const;

	for (const [status, ErrorClass, code, body] of cases) {
		it(`maps ${status} to ${ErrorClass.name}`, async () => {
			const error = await errorFor(
				json(status, body, { "x-request-uuid": "req-123" }),
			);

			expect(error).toBeInstanceOf(ErrorClass);
			expect(error).toBeInstanceOf(ApiError);
			expect(error).toBeInstanceOf(SnapsbrewError);
			expect(error).toMatchObject({
				code,
				status,
				message: body.message,
				requestId: "req-123",
				body,
			});
			expect((error as Error).name).toBe(ErrorClass.name);
		});
	}

	it("gives the field errors of a 422", async () => {
		const error = await errorFor(
			json(422, {
				message: "The variants.0.image_url must be a public http or https URL.",
				errors: {
					"variants.0.image_url": [
						"The variants.0.image_url must be a public http or https URL.",
					],
				},
			}),
		);

		expect(error).toBeInstanceOf(ValidationError);
		expect((error as ValidationError).errors).toEqual({
			"variants.0.image_url": [
				"The variants.0.image_url must be a public http or https URL.",
			],
		});
	});

	it("reads the code of an editor document error", async () => {
		const error = await errorFor(
			json(422, { code: "editor_operation_layer_not_found" }),
		);

		expect(error).toMatchObject({
			code: "validation_error",
			apiCode: "editor_operation_layer_not_found",
			message: "editor_operation_layer_not_found",
			errors: {},
		});
	});

	it("reads the current revision of an editor document conflict", async () => {
		const error = await errorFor(
			json(409, {
				code: "editor_document_conflict",
				current_revision: 5,
				current_document: { version: 2 },
			}),
		);

		expect(error).toBeInstanceOf(ConflictError);
		expect(error).toMatchObject({
			apiCode: "editor_document_conflict",
			currentRevision: 5,
		});
	});

	it("gives the Retry-After value and the limit of a 429", async () => {
		const error = await errorFor(
			json(
				429,
				{ message: "Too Many Attempts." },
				{
					"retry-after": "17",
					"x-ratelimit-limit": "10",
					"x-ratelimit-remaining": "0",
				},
			),
		);

		expect(error).toMatchObject({ retryAfter: 17, limit: 10 });
	});

	it("gives no limit when the 429 has no X-RateLimit-Limit header", async () => {
		const error = await errorFor(json(429, { message: "Too Many Attempts." }));

		expect((error as RateLimitError).limit).toBeUndefined();
	});

	for (const code of [
		"idempotency_key_in_progress",
		"idempotency_key_belongs_to_snap",
		"idempotency_key_belongs_to_batch",
		"legacy_edit_rejected_for_v2",
	] as const) {
		it(`reads the 409 code ${code}`, async () => {
			const error = await errorFor(
				json(409, { message: "The key cannot be used.", code }),
			);

			expect(error).toBeInstanceOf(ConflictError);
			expect(error).toMatchObject({ code: "conflict", apiCode: code });
			expect((error as ConflictError).currentRevision).toBeUndefined();
		});
	}

	it("keeps a body that is not JSON", async () => {
		const error = await errorFor(
			new Response("<html>Bad Gateway</html>", { status: 502 }),
		);

		expect(error).toBeInstanceOf(ServerError);
		expect(error).toMatchObject({
			body: "<html>Bad Gateway</html>",
			message: "<html>Bad Gateway</html>",
		});
	});

	it("uses the status as the message when the body is empty", async () => {
		const error = await errorFor(new Response(null, { status: 500 }));

		expect(error).toMatchObject({ message: "HTTP 500", body: undefined });
	});

	it("fails on a 200 response that is not JSON", async () => {
		const error = await errorFor(
			new Response("<html>login</html>", { status: 200 }),
		);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).message).toMatch(/baseUrl/);
	});

	it("never puts the token in the error", async () => {
		const error = await errorFor(json(401, { message: "Unauthenticated." }));

		expect(JSON.stringify(error)).not.toContain("test-token");
		expect(String(error)).not.toContain("test-token");
	});
});

describe("errors of POST /v1/snaps", () => {
	async function createError(response: Response): Promise<unknown> {
		const sb = client(mockFetch(response), { maxRetries: 0 });

		return sb.snaps.create({ templateId: "t-1" }).then(
			() => {
				throw new Error("The call did not fail.");
			},
			(error: unknown) => error,
		);
	}

	it("maps a refused permission (403) to AuthorizationError", async () => {
		const error = await createError(
			json(
				403,
				{ message: "This action is unauthorized." },
				{ "x-request-uuid": "req-403" },
			),
		);

		expect(error).toBeInstanceOf(AuthorizationError);
		expect(error).not.toBeInstanceOf(AuthenticationError);
		expect(error).toMatchObject({
			code: "authorization_error",
			status: 403,
			message: "This action is unauthorized.",
			requestId: "req-403",
		});
	});

	it("maps the generic 500 body to ServerError", async () => {
		const error = await createError(
			json(500, {
				message: "The server could not create the snap. Try again later.",
				code: "internal_error",
			}),
		);

		expect(error).toBeInstanceOf(ServerError);
		expect(error).toMatchObject({
			code: "server_error",
			apiCode: "internal_error",
			message: "The server could not create the snap. Try again later.",
		});
	});
});

describe("network errors", () => {
	it("wraps a refused connection", async () => {
		const error = await errorFor(connectionRefused());

		expect(error).toBeInstanceOf(ConnectionError);
		expect(error).toBeInstanceOf(SnapsbrewError);
		expect(error).toMatchObject({ code: "connection_error", beforeSend: true });
		expect((error as Error).cause).toBeInstanceOf(TypeError);
	});

	it("marks a reset connection as unknown", async () => {
		const error = await errorFor(connectionReset());

		expect(error).toMatchObject({
			code: "connection_error",
			beforeSend: false,
		});
	});

	it("reads the Bun error code", async () => {
		const error = await errorFor(
			Object.assign(new Error("Unable to connect"), {
				code: "ConnectionRefused",
			}),
		);

		expect(error).toMatchObject({ beforeSend: true });
	});

	it("throws a TimeoutError when an attempt takes too long", async () => {
		const fetch = vi.fn<FetchLike>(
			(_url, init) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
				}),
		);
		const sb = client(fetch, { timeout: 20, maxRetries: 0 });

		const error = await sb.account.get().catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(TimeoutError);
		expect(error).toMatchObject({ code: "timeout" });
	});
});

describe("switch on code", () => {
	it("narrows the error type", async () => {
		const error = await errorFor(
			json(422, { message: "Bad", errors: { name: ["Required"] } }),
		);

		if (!isSnapsbrewError(error)) {
			throw new Error("Expected a SnapsbrewError.");
		}

		switch (error.code) {
			case "validation_error":
				// The union narrows to ValidationError, so `errors` has a type here.
				expect(error.errors).toEqual({ name: ["Required"] });
				break;
			default:
				throw new Error(`Unexpected code ${error.code}.`);
		}
	});
});

describe("parseRetryAfter()", () => {
	it("reads seconds", () => {
		expect(parseRetryAfter("30")).toBe(30);
		expect(parseRetryAfter(" 0 ")).toBe(0);
	});

	it("reads an HTTP date", () => {
		const now = Date.parse("2026-11-17T10:00:00Z");
		expect(parseRetryAfter("Tue, 17 Nov 2026 10:00:05 GMT", now)).toBe(5);
		expect(parseRetryAfter("Tue, 17 Nov 2026 09:59:00 GMT", now)).toBe(0);
	});

	it("ignores a missing or bad value", () => {
		expect(parseRetryAfter(null)).toBeUndefined();
		expect(parseRetryAfter("soon")).toBeUndefined();
	});
});
