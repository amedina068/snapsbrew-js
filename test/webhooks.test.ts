import { Buffer } from "node:buffer";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
	isSnapsbrewError,
	type VerifiedWebhook,
	verifyWebhook,
	WEBHOOK_HEADERS,
	type WebhookPayload,
	WebhookVerificationError,
} from "../src/index";
import vectors from "./fixtures/webhook-vectors.json" with { type: "json" };

const NOW = new Date(vectors.now * 1000);
const [first] = vectors.cases;

if (first === undefined) {
	throw new Error("The webhook vectors have no case.");
}

async function hmacHex(message: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(vectors.secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(message));

	return Buffer.from(digest).toString("hex");
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
	return promise.then(
		() => {
			throw new Error("The verification did not fail.");
		},
		(error: unknown) => error,
	);
}

describe("verifyWebhook() with the shared vectors", () => {
	for (const vector of vectors.cases.filter((item) => item.valid)) {
		it(`accepts ${vector.name}`, async () => {
			const verified = await verifyWebhook({
				body: vector.body,
				headers: vector.headers,
				secret: vectors.secret,
				now: NOW,
			});

			expect(verified).toEqual({
				deliveryId: vector.delivery_id,
				timestamp: Number(vector.headers["X-Snapsbrew-Timestamp"]),
				payload: JSON.parse(vector.body),
			});
		});
	}

	for (const vector of vectors.cases.filter((item) => !item.valid)) {
		it(`refuses ${vector.name}`, async () => {
			const error = await failureOf(
				verifyWebhook({
					body: vector.body,
					headers: vector.headers,
					secret: vectors.secret,
					now: NOW,
				}),
			);

			expect(error).toBeInstanceOf(WebhookVerificationError);
			expect(error).toMatchObject({
				code: "webhook_verification_error",
				reason: vector.reason,
			});
			expect(isSnapsbrewError(error)).toBe(true);
		});
	}
});

describe("verifyWebhook() inputs", () => {
	const options = {
		body: first.body,
		headers: first.headers,
		secret: vectors.secret,
		now: NOW,
	};

	it("accepts the body as bytes", async () => {
		const bytes = new TextEncoder().encode(first.body);

		for (const body of [bytes, bytes.buffer, Buffer.from(first.body)]) {
			await expect(verifyWebhook({ ...options, body })).resolves.toMatchObject({
				payload: { event: "snap.completed" },
			});
		}
	});

	it("accepts a Headers object", async () => {
		await expect(
			verifyWebhook({ ...options, headers: new Headers(first.headers) }),
		).resolves.toMatchObject({
			deliveryId: first.headers["X-Snapsbrew-Delivery"],
		});
	});

	it("accepts the lowercase header object of Node.js", async () => {
		const headers = {
			"x-snapsbrew-delivery": [String(first.headers["X-Snapsbrew-Delivery"])],
			"x-snapsbrew-timestamp": first.headers["X-Snapsbrew-Timestamp"],
			"x-snapsbrew-signature": first.headers["X-Snapsbrew-Signature"],
			"content-type": "application/json",
		};

		await expect(verifyWebhook({ ...options, headers })).resolves.toMatchObject(
			{
				deliveryId: first.headers["X-Snapsbrew-Delivery"],
			},
		);
	});

	it("exports the header names", () => {
		expect(WEBHOOK_HEADERS).toEqual({
			delivery: "x-snapsbrew-delivery",
			timestamp: "x-snapsbrew-timestamp",
			signature: "x-snapsbrew-signature",
		});
	});

	it("refuses a missing header", async () => {
		const cases = [
			["X-Snapsbrew-Signature", "signature"],
			["X-Snapsbrew-Timestamp", "timestamp"],
		] as const;

		for (const [name, reason] of cases) {
			const headers: Record<string, string> = { ...first.headers };
			delete headers[name];

			const error = await failureOf(verifyWebhook({ ...options, headers }));

			expect(error).toBeInstanceOf(WebhookVerificationError);
			expect(error).toMatchObject({ reason });
		}
	});

	it("gives a null delivery ID when the delivery header is missing", async () => {
		const headers: Record<string, string> = { ...first.headers };
		delete headers["X-Snapsbrew-Delivery"];

		await expect(verifyWebhook({ ...options, headers })).resolves.toMatchObject(
			{ deliveryId: null },
		);
	});

	it("refuses a signed body that is not a JSON object", async () => {
		const timestamp = String(vectors.now);

		for (const body of ["{", "[]", '"text"', "null"]) {
			const signature = await hmacHex(`${timestamp}.${body}`);
			const error = await failureOf(
				verifyWebhook({
					...options,
					body,
					headers: {
						"X-Snapsbrew-Timestamp": timestamp,
						"X-Snapsbrew-Signature": signature,
					},
				}),
			);

			expect(error).toMatchObject({ reason: "payload" });
		}
	});

	it("refuses a timestamp that is not a number", async () => {
		const error = await failureOf(
			verifyWebhook({
				...options,
				headers: { ...first.headers, "X-Snapsbrew-Timestamp": "1.5e9" },
			}),
		);

		expect(error).toMatchObject({ reason: "timestamp" });
	});

	it("refuses a signature that is not hex", async () => {
		const error = await failureOf(
			verifyWebhook({
				...options,
				headers: { ...first.headers, "X-Snapsbrew-Signature": "sha256=abc" },
			}),
		);

		expect(error).toMatchObject({ reason: "signature" });
	});

	it("requires a secret", async () => {
		await expect(verifyWebhook({ ...options, secret: "" })).rejects.toThrow(
			TypeError,
		);
	});

	it("requires a tolerance of 0 or more", async () => {
		for (const tolerance of [-1, Number.NaN]) {
			await expect(verifyWebhook({ ...options, tolerance })).rejects.toThrow(
				TypeError,
			);
		}
	});
});

describe("verifyWebhook() timestamp tolerance", () => {
	const options = {
		body: first.body,
		headers: first.headers,
		secret: vectors.secret,
	};
	const at = (offset: number): Date => new Date((vectors.now + offset) * 1000);

	it("accepts a timestamp up to 300 seconds old or new", async () => {
		await expect(
			verifyWebhook({ ...options, now: at(vectors.tolerance_seconds) }),
		).resolves.toBeDefined();
		await expect(
			verifyWebhook({ ...options, now: at(-vectors.tolerance_seconds) }),
		).resolves.toBeDefined();
	});

	it("refuses a timestamp more than 300 seconds old or new", async () => {
		for (const offset of [301, -301]) {
			const error = await failureOf(
				verifyWebhook({ ...options, now: at(offset) }),
			);

			expect(error).toBeInstanceOf(WebhookVerificationError);
			expect(error).toMatchObject({ reason: "timestamp" });
		}
	});

	it("uses the tolerance option", async () => {
		await expect(
			verifyWebhook({ ...options, now: at(301), tolerance: 600 }),
		).resolves.toBeDefined();
		await expect(
			failureOf(verifyWebhook({ ...options, now: at(31), tolerance: 30 })),
		).resolves.toMatchObject({ reason: "timestamp" });
	});

	it("uses the current time by default", async () => {
		const error = await failureOf(verifyWebhook(options));

		expect(error).toMatchObject({ reason: "timestamp" });
	});
});

describe("webhook payload types", () => {
	it("narrows the payload on event", () => {
		expectTypeOf<VerifiedWebhook["payload"]>().toEqualTypeOf<WebhookPayload>();
		expectTypeOf<WebhookPayload["event"]>().toEqualTypeOf<
			| "snap.completed"
			| "snap.failed"
			| "snap-import.completed"
			| "snap-import.failed"
			| "snap-import.canceled"
		>();

		const payload = {} as WebhookPayload;

		switch (payload.event) {
			case "snap.failed":
				expectTypeOf(payload.snap.status).toEqualTypeOf<"failed">();
				expectTypeOf(payload.snap.last_error).toEqualTypeOf<"render_failed">();
				break;
			case "snap-import.completed":
				expectTypeOf(payload.import.total_rows).toEqualTypeOf<number>();
				expectTypeOf(payload.template.uuid).toEqualTypeOf<string | null>();
				break;
		}
	});
});
