/** One loaded page: the raw body, its items, and the token of the next page. */
export interface LoadedPage<TPage, TItem> {
	page: TPage;
	items: readonly TItem[];
	next: string | undefined;
}

export type PageLoader<TPage, TItem> = (
	token: string | undefined,
) => Promise<LoadedPage<TPage, TItem>>;

/**
 * The result of a list call. Use `await` to get the first page. Use
 * `for await` to get each item of each page. The SDK loads a page only when
 * the loop needs it.
 *
 * @example
 * const page = await sb.templates.list()
 * for await (const template of sb.templates.list()) {
 * 	console.log(template.title)
 * }
 */
export class PagePromise<TPage, TItem>
	implements PromiseLike<TPage>, AsyncIterable<TItem>
{
	readonly #load: PageLoader<TPage, TItem>;
	readonly #start: string | undefined;
	#first: Promise<LoadedPage<TPage, TItem>> | undefined;

	constructor(load: PageLoader<TPage, TItem>, start?: string) {
		this.#load = load;
		this.#start = start;
	}

	// biome-ignore lint/suspicious/noThenProperty: The class is awaitable on purpose.
	then<TResult1 = TPage, TResult2 = never>(
		onfulfilled?: ((page: TPage) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this.#firstPage()
			.then((loaded) => loaded.page)
			.then(onfulfilled, onrejected);
	}

	/** Yields each page, from the first page to the last page. */
	async *pages(): AsyncGenerator<TPage, void, undefined> {
		let loaded = await this.#firstPage();

		while (true) {
			yield loaded.page;

			if (loaded.next === undefined) {
				return;
			}

			loaded = await this.#load(loaded.next);
		}
	}

	/** Yields each item of each page. */
	async *[Symbol.asyncIterator](): AsyncGenerator<TItem, void, undefined> {
		let loaded = await this.#firstPage();

		while (true) {
			yield* loaded.items;

			if (loaded.next === undefined) {
				return;
			}

			loaded = await this.#load(loaded.next);
		}
	}

	/** Loads every item into one array. Use it only for short lists. */
	async toArray(): Promise<TItem[]> {
		const items: TItem[] = [];

		for await (const item of this) {
			items.push(item);
		}

		return items;
	}

	#firstPage(): Promise<LoadedPage<TPage, TItem>> {
		this.#first ??= this.#load(this.#start);

		return this.#first;
	}
}

/** The body of a cursor-paginated list. */
interface CursorBody<TItem> {
	data: TItem[];
	meta: { next_cursor: string | null };
}

/** Makes a `PagePromise` for an endpoint that returns `meta.next_cursor`. */
export function cursorPages<TPage extends CursorBody<TItem>, TItem>(
	fetchPage: (cursor: string | undefined) => Promise<TPage>,
	start?: string,
): PagePromise<TPage, TItem> {
	return new PagePromise(async (cursor) => {
		const page = await fetchPage(cursor);

		return { page, items: page.data, next: page.meta.next_cursor ?? undefined };
	}, start);
}
