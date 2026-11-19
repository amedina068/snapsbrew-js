// Smoke check for the built package. Each runtime entry point imports the
// package in its own way, then calls `check()` with the module.
const KEY = "test-signing-key-0123456789";
const TEMPLATE_ID = "044ec825-ee2f-4d06-bb77-98663e27f529";
// The `snap.failed` case of webhook-vectors.json.
const WEBHOOK = {
	secret: "whsec_test0123456789abcdefghijklmnopqrstuvwx",
	now: new Date(1767225600 * 1000),
	body: '{"event":"snap.failed","snap":{"id":"9f1c2d3e","media_url":"","width":1200,"height":630,"type":"image","status":"failed","is_async":true,"webhook_url":"https:\\/\\/example.com\\/hooks\\/snap","completed_at":"2026-05-01T12:00:03Z","last_error":"render_failed","variants":[],"template_id":"141e8454-8aa1-420a-bd0b-18a85ba949a2","template_title":"\\u00bfLaunch card?","created_at":"2026-05-01T12:00:00Z"}}',
	headers: {
		"X-Snapsbrew-Delivery": "3f2b6c1e-8a4d-4e5f-9b0a-1c2d3e4f5a6b",
		"X-Snapsbrew-Timestamp": "1767225600",
		"X-Snapsbrew-Signature":
			"7a9fc5e2ceb214b643b966e9343ab8ee64f772bd84932d1b678314df36bcef17",
	},
};
const EXPECTED =
	"https://snapsbrew.example/signed-url/image.jpg?template_id=044ec825-ee2f-4d06-bb77-98663e27f529&variants=W3sibGF5ZXIiOiJ0aXRsZSIsInRleHQiOiJEYXJrIEF2ZW5nZXJzIn0seyJsYXllciI6ImNvdmVyIiwiaW1hZ2VfdXJsIjoiaHR0cHM6Ly9leGFtcGxlLmNvbS9hL2IuanBnP3g9MSZ5PTIifV0%3D&signature=bff2011c8b8a10812f9c4b7432245d000a94f2bfcb50c04a62a369f1ec545e45";

export async function check(sdk, runtime) {
	const url = await sdk.signedUrl({
		baseUrl: "https://snapsbrew.example",
		key: KEY,
		templateId: TEMPLATE_ID,
		variants: [
			{ layer: "title", text: "Dark Avengers" },
			{ layer: "cover", image_url: "https://example.com/a/b.jpg?x=1&y=2" },
		],
	});

	if (url !== EXPECTED) {
		throw new Error(
			`${runtime}: the signed URL does not match the vector.\n${url}`,
		);
	}

	const sb = new sdk.Snapsbrew({
		baseUrl: "https://snapsbrew.example",
		token: "smoke-token",
		maxRetries: 0,
		fetch: async () =>
			new Response(JSON.stringify({ message: "Not found." }), {
				status: 404,
				headers: { "content-type": "application/json" },
			}),
	});

	try {
		await sb.templates.get("missing");
		throw new Error(`${runtime}: the call did not fail.`);
	} catch (error) {
		if (!(error instanceof sdk.NotFoundError) || error.code !== "not_found") {
			throw error;
		}
	}

	const webhook = await sdk.verifyWebhook(WEBHOOK);

	if (webhook.payload.snap?.last_error !== "render_failed") {
		throw new Error(`${runtime}: the webhook payload is not correct.`);
	}

	console.log(`${runtime}: the smoke check passed.`);
}
