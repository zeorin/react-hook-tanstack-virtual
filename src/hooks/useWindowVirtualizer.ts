import type { ReactVirtualizerOptions } from "@tanstack/react-virtual"
import {
	type PartialKeys,
	observeWindowOffset,
	observeWindowRect,
	windowScroll,
} from "@tanstack/virtual-core"

import {
	type Selector,
	type VirtualizerSnapshot,
	useVirtualizerBase,
} from "../lib/useVirtualizerBase"
import type { IsEqual } from "../types"

const getWindow = () => (typeof document !== "undefined" ? window : null)
const windowOffset = () =>
	typeof document !== "undefined" ? window.scrollY : 0

export const useWindowVirtualizer = <
	TItemElement extends Element,
	Selection = VirtualizerSnapshot<Window, TItemElement>,
>(
	options: PartialKeys<
		ReactVirtualizerOptions<Window, TItemElement>,
		| "getScrollElement"
		| "observeElementRect"
		| "observeElementOffset"
		| "scrollToFn"
	>,
	selector?: Selector<Window, TItemElement, Selection> | undefined,
	isEqual?: IsEqual<NoInfer<Selection>> | undefined,
): Selection =>
	useVirtualizerBase<Window, TItemElement, Selection>(
		{
			getScrollElement: getWindow,
			observeElementRect: observeWindowRect,
			observeElementOffset: observeWindowOffset,
			scrollToFn: windowScroll,
			initialOffset: windowOffset,
			...options,
		},
		selector,
		isEqual,
	)

const windowVirtualizerHook = useWindowVirtualizer

const windowVirtualizerHookʹ =
	<TItemElement extends Element>(
		options: PartialKeys<
			ReactVirtualizerOptions<Window, TItemElement>,
			"observeElementRect" | "observeElementOffset" | "scrollToFn"
		>,
	) =>
	<Selection = VirtualizerSnapshot<Window, TItemElement>>(
		selector?: Selector<Window, TItemElement, Selection> | undefined,
		isEqual?: IsEqual<NoInfer<Selection>> | undefined,
	): Selection =>
		windowVirtualizerHook<TItemElement, Selection>(options, selector, isEqual)

export { windowVirtualizerHookʹ as useWindowVirtualizerʹ }
