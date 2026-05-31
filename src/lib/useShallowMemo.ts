import { useState } from "react"

import { isShallowEqual } from "./isShallowEqual"

export const useShallowMemo = <T>(next: T): T => {
	const [current, setCurrent] = useState(next)

	if (!isShallowEqual(current, next)) {
		setCurrent(next)
	}

	return current
}
