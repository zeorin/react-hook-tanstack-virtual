import {
	useCallback,
	useInsertionEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react"
import { flushSync } from "react-dom"

import { Virtualizer, type VirtualizerOptions } from "@tanstack/virtual-core"

import type { IsEqual } from "../types"
import { identity } from "./identity"
import { isShallowEqual } from "./isShallowEqual"
import { useLayoutEffect } from "./useLayoutEffect"
import { useShallowMemo } from "./useShallowMemo"

export interface ReactVirtualizerOptions<
	TScrollElement extends Element | Window,
	TItemElement extends Element,
> extends VirtualizerOptions<TScrollElement, TItemElement> {
	useFlushSync?: boolean
	/**
	 * Skip React re-renders for scroll-only updates. The virtualizer writes
	 * item positions (`top`/`left`) and the container size (`height`/`width`)
	 * directly to the DOM, and only re-renders when the visible index range
	 * or `isScrolling` changes.
	 *
	 * Requirements when enabled:
	 * - Item elements must be `position: absolute`; in `'transform'` mode they
	 *	 must also be anchored with `top: 0` / `left: 0`.
	 * - Item elements must NOT set the main-axis position in their style — the
	 *	 virtualizer owns `top` / `left` in `'position'` mode and `transform` in
	 *	 `'transform'` mode.
	 * - The inner size container must provide `directDomContainer` and
	 *	 must NOT set `height` / `width` in its style.
	 * - For multi-lane layouts (grids / masonry), the cross-axis position
	 *	 (e.g. `left: ${(item.lane * 100) / lanes}%`) is stable per item and
	 *	 must still be set in your JSX — only the main axis is automated.
	 *
	 * This flag is intended to be set once at mount. Toggling it (or
	 *	`directDomUpdatesMode`) at runtime can leave stale inline styles on
	 *	items and the container.
	 */
	directDomUpdates?: boolean
	/**
	 * How `directDomUpdates` positions item elements.
	 * - `'transform'` (default): writes `transform: translate3d(...)`.
	 *	 Promotes items to their own compositor layer — usually smoother on long
	 *	 lists, but creates a stacking context and can interfere with
	 *	 `position: fixed` descendants. Item elements must still be anchored with
	 *	 `position: absolute`, `top: 0`, and `left: 0`.
	 * - `'position'`: writes `top` / `left`. Item elements must be
	 *	 `position: absolute`.
	 */
	directDomUpdatesMode?: "position" | "transform"

	directDomContainer?: HTMLElement | null
}

export interface VirtualizerSnapshot<
	TScrollElement extends Element | Window,
	TItemElement extends Element,
> extends Omit<
	Virtualizer<TScrollElement, TItemElement>,
	"getVirtualItems" | "getVirtualIndexes" | "isAtEnd" | "getTotalSize"
> {
	virtualItems: ReturnType<
		Virtualizer<TScrollElement, TItemElement>["getVirtualItems"]
	>
	virtualIndexes: ReturnType<
		Virtualizer<TScrollElement, TItemElement>["getVirtualIndexes"]
	>
	totalSize: ReturnType<
		Virtualizer<TScrollElement, TItemElement>["getTotalSize"]
	>
}

export type Selector<
	TScrollElement extends Element | Window,
	TItemElement extends Element,
	Selection,
> = (
	virtualizerSnapshot: VirtualizerSnapshot<TScrollElement, TItemElement>,
	virtualizer: Virtualizer<TScrollElement, TItemElement>,
) => Selection

const getVirtualizerSnapshot = <
	TScrollElement extends Element | Window,
	TItemElement extends Element,
>({
	getVirtualItems,
	getVirtualIndexes,
	getTotalSize,
	...instance
}: Virtualizer<TScrollElement, TItemElement>): VirtualizerSnapshot<
	TScrollElement,
	TItemElement
> => ({
	...instance,
	virtualItems: getVirtualItems(),
	virtualIndexes: getVirtualIndexes(),
	totalSize: getTotalSize(),
})

const isVirtualizerSnapshotEqual = <
	TScrollElement extends Element | Window,
	TItemElement extends Element,
>(
	{
		options: aOptions,
		...a
	}: VirtualizerSnapshot<TScrollElement, TItemElement>,
	{
		options: bOptions,
		...b
	}: VirtualizerSnapshot<TScrollElement, TItemElement>,
): boolean => isShallowEqual(aOptions, bOptions) && isShallowEqual(a, b)

export const useVirtualizerBase = <
	TScrollElement extends Element | Window,
	TItemElement extends Element,
	Selection = VirtualizerSnapshot<TScrollElement, TItemElement>,
>(
	{
		useFlushSync = true,
		directDomUpdates = false,
		directDomUpdatesMode = "transform",
		directDomContainer,
		...rest
	}: ReactVirtualizerOptions<TScrollElement, TItemElement>,
	selector: Selector<
		TScrollElement,
		TItemElement,
		Selection
	> = identity as never,
	isEqual: IsEqual<NoInfer<Selection>> = isShallowEqual,
): Selection => {
	"use no memo"

	const options = useShallowMemo(rest)

	const [instance] = useState(
		() => new Virtualizer<TScrollElement, TItemElement>(options),
	)

	// Use this to track the rendered snapshot.
	const instRef = useRef<
		| {
				hasValue: false
				value: null
		  }
		| { hasValue: true; value: Selection }
	>({
		hasValue: false,
		value: null,
	})

	const [listeners] = useState(() => new Set<() => void>())

	const subscribe = useCallback(
		(onVirtualizationChange: () => void) => {
			listeners.add(onVirtualizationChange)
			return () => {
				listeners.delete(onVirtualizationChange)
			}
		},
		[listeners],
	)

	// eslint-disable-next-line react-hooks/immutability
	const getSnapshot = useMemo(() => {
		let hasMemo = false,
			memoizedVirtualizerSnapshot: VirtualizerSnapshot<
				TScrollElement,
				TItemElement
			>,
			memoizedSelection: Selection

		return () => {
			const nextVirtualizerSnapshot = getVirtualizerSnapshot(instance)
			if (!hasMemo) {
				// The first time the hook is called, there is no memoized result.
				// eslint-disable-next-line react-hooks/immutability -- should be fine 😅 this is how it is in the upstream, too
				hasMemo = true
				memoizedVirtualizerSnapshot = nextVirtualizerSnapshot
				const nextSelection = selector(nextVirtualizerSnapshot, instance)

				// Even if the selector has changed, the currently rendered selection
				// may be equal to the new selection. We should attempt to reuse the
				// current value if possible, to preserve downstream memoizations.
				if (instRef.current.hasValue) {
					const currentSelection = instRef.current.value
					if (isEqual(currentSelection, nextSelection)) {
						memoizedSelection = currentSelection
						return currentSelection
					}
				}

				memoizedSelection = nextSelection
				return nextSelection
			}

			const prevVirtualizerSnapshot = memoizedVirtualizerSnapshot
			// eslint-disable-next-line react-hooks/memo-dependencies
			const prevSelection = memoizedSelection

			if (
				isVirtualizerSnapshotEqual(
					prevVirtualizerSnapshot,
					nextVirtualizerSnapshot,
				)
			) {
				// The snapshot is the same as last time. Reuse the previous selection.
				return prevSelection
			}

			// The snapshot has changed, so we need to compute a new selection.
			const nextSelection = selector(nextVirtualizerSnapshot, instance)

			// If a custom isEqual function is provided, use that to check if the data
			// has changed. If it hasn't, return the previous selection. That signals
			// to React that the selections are conceptually equal, and we can bail
			// out of rendering.
			if (isEqual !== undefined && isEqual(prevSelection, nextSelection)) {
				// The snapshot still has changed, so make sure to update to not keep
				// old references alive
				memoizedVirtualizerSnapshot = nextVirtualizerSnapshot
				return prevSelection
			}

			memoizedVirtualizerSnapshot = nextVirtualizerSnapshot
			memoizedSelection = nextSelection
			return nextSelection
		}
	}, [selector, isEqual, instance])

	// Mutable across renders so the onChange closure captured by setOptions
	// always reads the latest values without us having to re-create it.
	const directRef = useRef({
		enabled: directDomUpdates,
		mode: directDomUpdatesMode,
		container: null as HTMLElement | null,
		lastSize: null as number | null,
		// Keyed by the element itself so a remounted node (same key, new DOM
		// node — e.g. when `enabled` is toggled off then on) is treated as fresh
		// and gets its style written.
		lastPositions: new WeakMap<HTMLElement, number>(),
		prevRange: null as {
			startIndex: number
			endIndex: number
			isScrolling: boolean
		} | null,
	})
	useInsertionEffect(() => {
		directRef.current.enabled = directDomUpdates
		directRef.current.mode = directDomUpdatesMode
	})

	useLayoutEffect(() => {
		const state = directRef.current
		state.container = directDomContainer ?? null
		state.lastSize = null
		if (directDomContainer && state.enabled) {
			const total = instance.getTotalSize()
			state.lastSize = total
			const axis = instance.options.horizontal ? "width" : "height"
			directDomContainer.style.setProperty(axis, `${total}px`)
		}
		return () => {
			state.container = null
			state.lastSize = null
		}
	}, [instance, directDomContainer])

	// Writes container size + item positions to the DOM. Idempotent — guarded
	// by lastSize / lastPositions. Called from onChange (covers scroll-driven
	// updates) and from a layout effect (covers post-render commits when refs
	// have just registered new items in elementsCache).
	const applyDirectStyles = useCallback(
		(instance: Virtualizer<TScrollElement, TItemElement>) => {
			const state = directRef.current
			if (!state.enabled || !state.container) return

			const totalSize = instance.getTotalSize()
			if (totalSize !== state.lastSize) {
				state.lastSize = totalSize
				const sizeAxis = instance.options.horizontal ? "width" : "height"
				state.container.style.setProperty(sizeAxis, `${totalSize}px`)
			}

			const horizontal = !!instance.options.horizontal
			const useTransform = state.mode === "transform"
			const posAxis = horizontal ? "left" : "top"
			const scrollMargin = instance.options.scrollMargin
			const items = instance.getVirtualItems()
			for (const item of items) {
				const next = item.start - scrollMargin
				const el = instance.elementsCache.get(item.key) as
					| HTMLElement
					| undefined
				if (!el) continue
				if (state.lastPositions.get(el) === next) continue
				state.lastPositions.set(el, next)
				if (useTransform) {
					el.style.setProperty(
						"transform",
						horizontal ?
							`translate3d(${next}px, 0, 0)`
						: `translate3d(0, ${next}px, 0)`,
					)
				} else {
					el.style.setProperty(posAxis, `${next}px`)
				}
			}
		},
		[],
	)

	const onChange = useCallback(
		// eslint-disable-next-line react-hooks/immutability
		(
			instance: Virtualizer<TScrollElement, TItemElement>,
			sync: boolean,
		): void => {
			const state = directRef.current
			let shouldRerender = true

			if (state.enabled) {
				applyDirectStyles(instance)

				// Only re-render on range / isScrolling changes
				const range = instance.range
				const prev = state.prevRange
				shouldRerender =
					!prev
					|| prev.isScrolling !== instance.isScrolling
					|| prev.startIndex !== range?.startIndex
					|| prev.endIndex !== range?.endIndex
				if (shouldRerender) {
					state.prevRange =
						range ?
							{
								startIndex: range.startIndex,
								endIndex: range.endIndex,
								isScrolling: instance.isScrolling,
							}
						: null
				}
			}

			if (shouldRerender) {
				if (useFlushSync && sync) {
					// eslint-disable-next-line @eslint-react/dom-no-flush-sync
					flushSync(() => {
						for (const listener of listeners) {
							listener()
						}
					})
				} else {
					for (const listener of listeners) {
						listener()
					}
				}
			}

			options.onChange?.call(undefined, instance, sync)
		},
		[applyDirectStyles, listeners, options.onChange, useFlushSync],
	)

	const resolvedOptions = useMemo<
		VirtualizerOptions<TScrollElement, TItemElement>
	>(() => ({ ...options, onChange }), [onChange, options])

	useLayoutEffect(() => {
		instance.setOptions(resolvedOptions)
		return instance._willUpdate()
	}, [listeners, instance, resolvedOptions])

	useLayoutEffect(() => {
		return instance._didMount()
	}, [instance])

	useLayoutEffect(() => {
		applyDirectStyles(instance)
	})

	const value = useSyncExternalStore(subscribe, getSnapshot)

	useInsertionEffect(() => {
		instRef.current.hasValue = true
		instRef.current.value = value
	}, [value])

	return value
}
