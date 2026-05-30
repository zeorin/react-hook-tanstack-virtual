import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type PartialKeys,
} from '@tanstack/virtual-core'
import type { ReactVirtualizerOptions } from '@tanstack/react-virtual'

import { useVirtualizerBase, type Selector, type VirtualizerSnapshot } from '../lib/useVirtualizerBase'
import type { IsEqual } from '../types'

export const useVirtualizer = <
  TScrollElement extends Element,
  TItemElement extends Element,
	Selection = VirtualizerSnapshot<TScrollElement, TItemElement>
>(
  options: PartialKeys<
    ReactVirtualizerOptions<TScrollElement, TItemElement>,
    'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
  >,
	selector?: Selector<TScrollElement, TItemElement, Selection> | undefined,
  isEqual?: IsEqual<NoInfer<Selection>> | undefined
): Selection =>
	useVirtualizerBase<TScrollElement, TItemElement, Selection>(
		{
			observeElementRect: observeElementRect,
			observeElementOffset: observeElementOffset,
			scrollToFn: elementScroll,
			...options,
		},
		selector,
		isEqual
	)

const virtualizerHook = useVirtualizer

const virtualizerHookʹ = <
  TScrollElement extends Element,
  TItemElement extends Element
>(
  options: PartialKeys<
    ReactVirtualizerOptions<TScrollElement, TItemElement>,
    'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
  >,
) => <Selection = VirtualizerSnapshot<TScrollElement, TItemElement>>(
	selector?: Selector<TScrollElement, TItemElement, Selection> | undefined,
  isEqual?: IsEqual<NoInfer<Selection>> | undefined
): Selection =>
	virtualizerHook<TScrollElement, TItemElement, Selection>(
		options,
		selector,
		isEqual
	)

export { virtualizerHookʹ as useVirtualizerʹ }
