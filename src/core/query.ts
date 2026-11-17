/** A query value. Arrays and objects use the PHP bracket form: `variants[0][layer]=title`. */
export type QueryValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly unknown[]
	| object;

export type QueryParams = Readonly<Record<string, QueryValue>>;

/**
 * Appends parameters in the form that Laravel reads. `undefined` and `null`
 * are left out. A boolean becomes `1` or `0`, because the Laravel `boolean`
 * rule does not accept the strings `true` and `false`.
 */
export function appendQuery(
	search: URLSearchParams,
	params: QueryParams,
): void {
	for (const [key, value] of Object.entries(params)) {
		appendValue(search, key, value);
	}
}

function appendValue(
	search: URLSearchParams,
	key: string,
	value: unknown,
): void {
	if (value === undefined || value === null) {
		return;
	}

	if (typeof value === "boolean") {
		search.append(key, value ? "1" : "0");
		return;
	}

	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			appendValue(search, `${key}[${index}]`, item);
		});
		return;
	}

	if (typeof value === "object") {
		for (const [child, item] of Object.entries(value)) {
			appendValue(search, `${key}[${child}]`, item);
		}
		return;
	}

	search.append(key, String(value));
}

/** Encodes one path segment. An empty value throws, because it changes the route. */
export function segment(value: string | number): string {
	const text = String(value);

	if (text === "") {
		throw new TypeError("An id must not be empty.");
	}

	return encodeURIComponent(text);
}
