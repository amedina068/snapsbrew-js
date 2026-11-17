import type { ImageFormat, Variant } from "./types";

/** The options of `signedUrl()`. */
export type SignedUrlOptions = {
	/** The root URL of the Snapsbrew instance, for example `https://app.snapsbrew.com`. */
	baseUrl: string | URL;
	/** The signing key. It is a secret: sign only on the server. */
	key: string;
	/** The UUID of the template. */
	templateId: string;
	/** The overrides for the layers of the template. */
	variants?: readonly Variant[];
	/**
	 * More query parameters to sign. Use it only for a parameter that the
	 * server reads and that this SDK does not know yet.
	 */
	params?: Readonly<Record<string, string>>;
} & (
	| { format?: "png" | "webp"; transparent?: boolean }
	| { format: "jpeg"; transparent?: false }
);

// The SDK sets the first four names. The server drops `signature`,
// `identifier` and `api_log_uuid` from the signed string and overwrites the
// last two, so a caller value for them breaks the signature.
const RESERVED_PARAMS = new Set([
	"template_id",
	"variants",
	"format",
	"transparent",
	"signature",
	"identifier",
	"api_log_uuid",
]);

/**
 * Builds a signed URL that renders an image with no API call. Put the URL in
 * an `<img src>` or an `og:image` tag. The same URL always gives the same
 * image, so the server renders it one time and then serves the cached file.
 *
 * Call this function only on the server. A signing key in a browser bundle
 * lets anyone render images on your account.
 *
 * @example
 * const url = await signedUrl({
 * 	baseUrl: 'https://app.snapsbrew.com',
 * 	key: process.env.SNAPSBREW_SIGNING_KEY,
 * 	templateId: '044ec825-ee2f-4d06-bb77-98663e27f529',
 * 	variants: [{ layer: 'title', text: 'Hello' }],
 * })
 */
export async function signedUrl(options: SignedUrlOptions): Promise<string> {
	if (typeof options.key !== "string" || options.key === "") {
		throw new TypeError("`key` must be a signing key that is not empty.");
	}

	if (typeof options.templateId !== "string" || options.templateId === "") {
		throw new TypeError("`templateId` must be a template UUID.");
	}

	// The type rejects this pair. The check protects callers in plain JavaScript.
	if (
		options.format === "jpeg" &&
		(options as { transparent?: boolean }).transparent === true
	) {
		throw new TypeError("The JPEG format does not support transparency.");
	}

	const params: Array<[string, string]> = [["template_id", options.templateId]];

	if (options.format !== undefined) {
		params.push(["format", options.format satisfies ImageFormat]);
	}

	if (options.transparent === true) {
		params.push(["transparent", "1"]);
	}

	for (const [name, value] of Object.entries(options.params ?? {})) {
		params.push([checkParamName(name), value]);
	}

	if (options.variants !== undefined) {
		params.push(["variants", encodeVariants(options.variants)]);
	}

	const signature = await hmacSha256Hex(options.key, canonicalString(params));
	const entries: Array<[string, string]> = [
		...params,
		["signature", signature],
	];
	const query = entries
		.map(
			([name, value]) =>
				`${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
		)
		.join("&");

	return `${new URL("signed-url/image.jpg", instanceUrl(options.baseUrl)).href}?${query}`;
}

/**
 * Encodes variants as standard base64 (with `+`, `/` and `=`) of their JSON.
 * The server decodes the value with the PHP `base64_decode` function, so
 * URL-safe base64 does not work.
 */
export function encodeVariants(variants: readonly Variant[]): string {
	const bytes = new TextEncoder().encode(JSON.stringify(variants));
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

/**
 * Builds the string that the signature covers: each parameter except
 * `signature`, sorted by name in byte order, as `name=value`, joined with `&`.
 * The values are raw, not URL-encoded.
 */
export function canonicalString(
	params: Iterable<readonly [string, string]>,
): string {
	return [...params]
		.filter(([name]) => name !== "signature")
		.sort(([a], [b]) => compareBytes(a, b))
		.map(([name, value]) => `${name}=${value}`)
		.join("&");
}

/** Returns the HMAC-SHA256 of `message` as lowercase hex. */
export async function hmacSha256Hex(
	key: string,
	message: string,
): Promise<string> {
	const encoder = new TextEncoder();
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		encoder.encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const digest = new Uint8Array(
		await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)),
	);

	return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

function compareBytes(a: string, b: string): number {
	const encoder = new TextEncoder();
	const left = encoder.encode(a);
	const right = encoder.encode(b);
	const length = Math.min(left.length, right.length);

	for (let index = 0; index < length; index++) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0);

		if (difference !== 0) {
			return difference;
		}
	}

	return left.length - right.length;
}

// PHP changes a query name that has a dot, a space or a bracket, so the server
// signs a different name. The SDK refuses such a name.
function checkParamName(name: string): string {
	if (RESERVED_PARAMS.has(name)) {
		throw new TypeError(
			`The name \`${name}\` is reserved. Use the option for it, or remove it.`,
		);
	}

	if (!/^[A-Za-z0-9_-]+$/.test(name)) {
		throw new TypeError(
			`The parameter name \`${name}\` must contain only letters, digits, \`_\` and \`-\`.`,
		);
	}

	return name;
}

function instanceUrl(baseUrl: string | URL): URL {
	let url: URL;

	try {
		url = new URL(baseUrl);
	} catch {
		throw new TypeError(
			"`baseUrl` must be an absolute URL, for example `https://app.snapsbrew.com`.",
		);
	}

	url.search = "";
	url.hash = "";

	if (!url.pathname.endsWith("/")) {
		url.pathname += "/";
	}

	return url;
}
