import { segment } from "../core/query";
import { type RequestOptions, sleep, type Transport } from "../core/transport";
import type {
	Batch,
	BatchWithItems,
	OutputOptions,
	Snap,
	TerminalBatchStatus,
	Variant,
} from "../types";

/**
 * How the server delivers the snap. A sync call waits for the render. An
 * async call returns at once, and the server posts the result to `webhookUrl`.
 */
export type SnapDelivery =
	| { async?: false; webhookUrl?: string }
	| { async: true; webhookUrl: string };

type SnapCommon = {
	/** The overrides for the layers. */
	variants?: readonly Variant[];
} & OutputOptions &
	SnapDelivery;

/** The fields of `snaps.create()` for one template. */
export type CreateSnapParams = SnapCommon & {
	/** The UUID of the template. */
	templateId: string;
	collectionId?: never;
	/**
	 * A key for a safe retry. The server keeps the key for 24 hours. A repeat
	 * with the same key returns the first snap and renders nothing. With a
	 * key, the SDK also retries the call after a server error, a timeout, or
	 * a 409 `idempotency_key_in_progress`. Do not use a key of a batch.
	 */
	idempotencyKey?: string;
};

/** The fields of `snaps.create()` for each template of a collection. */
export type CreateCollectionSnapsParams = SnapCommon & {
	/** The UUID of the collection. The server renders one snap for each template. */
	collectionId: string;
	templateId?: never;
	/** The server does not accept an idempotency key for a collection. */
	idempotencyKey?: never;
};

/** The fields of `snaps.preview()`. */
export interface SnapPreviewParams {
	templateId: string;
	variants?: readonly Variant[];
}

/** `/v1/snaps`: render snaps. */
export class Snaps {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/**
	 * Renders a snap from the published version of a template. The server
	 * stores each render. Use `preview()` first: it stores nothing.
	 *
	 * @example
	 * const snap = await sb.snaps.create({
	 * 	templateId: '044ec825-ee2f-4d06-bb77-98663e27f529',
	 * 	variants: [{ layer: 'title', text: 'Hello' }],
	 * })
	 * console.log(snap.media_url)
	 */
	create(params: CreateSnapParams, options?: RequestOptions): Promise<Snap>;
	/** Renders one snap for each template of a collection. */
	create(
		params: CreateCollectionSnapsParams,
		options?: RequestOptions,
	): Promise<Snap[]>;
	create(
		params: CreateSnapParams | CreateCollectionSnapsParams,
		options: RequestOptions = {},
	): Promise<Snap | Snap[]> {
		return this.#transport.request<Snap | Snap[]>(
			{
				method: "POST",
				path: "/v1/snaps",
				json: {
					template_id: params.templateId,
					collection_id: params.collectionId,
					variants: params.variants,
					type: params.type,
					format: params.format,
					transparent: params.transparent,
					async: params.async,
					webhook_url: params.webhookUrl,
					idempotency_key: params.idempotencyKey,
				},
				keyed: params.idempotencyKey !== undefined,
			},
			options,
		);
	}

	/**
	 * Renders a watermarked HTML preview of a snap. A preview stores nothing.
	 * The server allows 10 previews a minute.
	 */
	async preview(
		params: SnapPreviewParams,
		options: RequestOptions = {},
	): Promise<string> {
		return this.#transport.request<string>(
			{
				method: "GET",
				path: "/v1/snaps/preview",
				query: { template_id: params.templateId, variants: params.variants },
				text: true,
			},
			options,
		);
	}
}

/** One item of a batch. */
export interface BatchItemParams {
	/** The overrides for this item. */
	variants?: readonly Variant[];
	/** Your name for the item. The default is `item_1`, `item_2`, and so on. */
	identifier?: string;
}

/** The fields of `batches.create()`. */
export type CreateBatchParams = {
	/** The UUID of the template. Each item renders from it. */
	templateId: string;
	/** One to 100 items. */
	items: readonly BatchItemParams[];
	/** A name for the batch. The default is `API batch`. */
	title?: string;
	/** The server posts one request to this URL when the batch is complete. */
	webhookUrl?: string;
	/**
	 * A key for a safe retry. See `CreateSnapParams.idempotencyKey`. Do not
	 * use a key of a single snap.
	 */
	idempotencyKey?: string;
} & OutputOptions;

/** The settings of `batches.wait()`. */
export interface WaitOptions extends RequestOptions {
	/** The time between two reads, in milliseconds. The default is 5000. */
	interval?: number;
}

const TERMINAL_STATUSES: ReadonlySet<string> = new Set<TerminalBatchStatus>([
	"completed",
	"failed",
	"canceled",
]);

/** `/v1/snaps/batches`: render up to 100 snaps from one template. */
export class Batches {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Starts a batch. The items render in the background. */
	create(
		params: CreateBatchParams,
		options: RequestOptions = {},
	): Promise<Batch> {
		return this.#transport.request<Batch>(
			{
				method: "POST",
				path: "/v1/snaps/batches",
				json: {
					template_id: params.templateId,
					items: params.items,
					title: params.title,
					webhook_url: params.webhookUrl,
					type: params.type,
					format: params.format,
					transparent: params.transparent,
					idempotency_key: params.idempotencyKey,
				},
				keyed: params.idempotencyKey !== undefined,
			},
			options,
		);
	}

	/** Reads a batch with each of its items. */
	async get(
		batchUuid: string,
		options: RequestOptions = {},
	): Promise<BatchWithItems> {
		return this.#transport.request<BatchWithItems>(
			{ method: "GET", path: `/v1/snaps/batches/${segment(batchUuid)}` },
			options,
		);
	}

	/**
	 * Stops the items that did not start. You cannot undo a cancel. A cancel
	 * of a batch that is complete changes nothing.
	 */
	async cancel(
		batchUuid: string,
		options: RequestOptions = {},
	): Promise<BatchWithItems> {
		return this.#transport.request<BatchWithItems>(
			{
				method: "POST",
				path: `/v1/snaps/batches/${segment(batchUuid)}/cancel`,
				idempotent: true,
			},
			options,
		);
	}

	/**
	 * Reads the batch until its status is `completed`, `failed` or `canceled`.
	 * To set a time limit, pass `signal: AbortSignal.timeout(ms)`.
	 */
	async wait(
		batchUuid: string,
		options: WaitOptions = {},
	): Promise<BatchWithItems> {
		const { interval = 5000, ...requestOptions } = options;

		while (true) {
			const batch = await this.get(batchUuid, requestOptions);

			if (TERMINAL_STATUSES.has(batch.status)) {
				return batch;
			}

			await sleep(interval, options.signal);
		}
	}
}
