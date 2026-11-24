import type { RequestOptions, Transport } from "../core/transport";
import type { Snap } from "../types";

/** A layer value of a form: a string for text, a `Blob` or a `File` for an image. */
export type FormLayerValue = string | Blob;

/**
 * The embedded forms of the instance. A form renders on the account of its
 * owner, so the SDK sends no token to the submit URL. The URL carries its own
 * signature.
 */
export class Forms {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/**
	 * Sends the layers of a form. A template form returns one snap. A
	 * collection form returns a list of snaps, and its layer keys are
	 * `{template uuid}__{layer key}`. The SDK retries a 429, but not a 5xx,
	 * because each submit renders a snap.
	 *
	 * @param url - The signed submit URL of the form. Copy it from your instance.
	 *
	 * @example
	 * const snap = await sb.forms.submit(submitUrl, { headline: 'Hello', photo: file })
	 */
	async submit(
		url: string | URL,
		layers: Readonly<Record<string, FormLayerValue>>,
		options: RequestOptions = {},
	): Promise<Snap | Snap[]> {
		const form = new FormData();

		for (const [key, value] of Object.entries(layers)) {
			form.append(`layers[${key}]`, value);
		}

		return this.#transport.request<Snap | Snap[]>(
			{ method: "POST", path: "", signedUrl: formUrl(url), form },
			options,
		);
	}
}

function formUrl(url: string | URL): string {
	const href = String(url);

	if (!/^https?:\/\//i.test(href)) {
		throw new TypeError(
			"`url` must be the signed submit URL of the form, for example `https://app.snapsbrew.com/api/v1/embedded-forms/...?signature=...`.",
		);
	}

	return href;
}
