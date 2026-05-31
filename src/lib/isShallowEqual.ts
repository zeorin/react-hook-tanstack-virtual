const isMapShallowEqual = (
	a: ReadonlyMap<unknown, unknown>,
	b: ReadonlyMap<unknown, unknown>,
): boolean => {
	if (a.size !== b.size) {
		return false
	}

	for (const [key, value] of a) {
		const valueB = b.get(key)
		if (value !== valueB || !Object.is(value, valueB)) {
			return false
		}
	}

	return true
}

const isSetShallowEqual = (
	a: ReadonlySet<unknown>,
	b: ReadonlySet<unknown>,
): boolean => {
	if (a.size !== b.size) {
		return false
	}

	for (const value of a) {
		if (!b.has(value)) {
			return false
		}
	}

	return true
}

export const isShallowEqual = <T>(a: T, b: T): boolean => {
	if (a === b || Object.is(a, b)) {
		return true
	}

	if (
		typeof a !== "object" ||
		a === null ||
		typeof b !== "object" ||
		b === null
	) {
		return false
	}

	if (a instanceof Map && b instanceof Map) {
		return isMapShallowEqual(a, b)
	}

	if (a instanceof Set && b instanceof Set) {
		return isSetShallowEqual(a, b)
	}

	const keys = Object.keys(a)
	if (keys.length !== Object.keys(b).length) {
		return false
	}

	for (const key of keys) {
		if (!Object.hasOwn(b, key)) {
			return false
		}

		const { [key as keyof T]: valueA } = a
		const { [key as keyof T]: valueB } = b

		if (valueA !== valueB || !Object.is(valueA, valueB)) {
			return false
		}
	}

	return true
}
