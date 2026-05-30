import {
	useCallback,
	useInsertionEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react"

import type { ReactVirtualizerOptions } from "@tanstack/react-virtual"
import { Virtualizer, type VirtualizerOptions } from "@tanstack/virtual-core"

import type { IsEqual } from "../types"
import { identity } from "./identity"
import { isShallowEqual } from "./isShallowEqual"
import { useLayoutEffect } from "./useLayoutEffect"
import { useShallowMemo } from "./useShallowMemo"

const UNINITIALIZED = Symbol("UNINITIALIZED")

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
	options: ReactVirtualizerOptions<TScrollElement, TItemElement>,
	selector: Selector<
		TScrollElement,
		TItemElement,
		Selection
	> = identity as never,
	isEqual: IsEqual<NoInfer<Selection>> = isShallowEqual,
): Selection => {
	"use no memo"

	const memoOptions = useShallowMemo(options)

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

	const getSnapshot = useMemo(() => {
		const cache = new WeakMap<Virtualizer<any, any>, () => Selection>()

		return (instance: Virtualizer<TScrollElement, TItemElement>) => {
			let cached = cache.get(instance)

			if (!cached) {
				let hasMemo = false,
					memoizedVirtualizerSnapshot: VirtualizerSnapshot<
						TScrollElement,
						TItemElement
					>,
					memoizedSelection: Selection

				cached = () => {
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

				cache.set(instance, cached)
			}

			return cached
		}
	}, [selector, isEqual])

	const [listeners] = useState(() => new Set<() => void>())

	const subscribe = useMemo(
		() =>
			memoOptions.useFlushSync ?
				(onVirtualizationChange: () => void) => {
					listeners.add(onVirtualizationChange)
					return () => {
						listeners.delete(onVirtualizationChange)
					}
				}
			: () => () => {},
		[memoOptions, listeners],
	)

	const [snapshot, setSnapshot] = useState<Selection | typeof UNINITIALIZED>(
		UNINITIALIZED,
	)

	const onChange = useCallback(
		(
			instance: Virtualizer<TScrollElement, TItemElement>,
			sync: boolean,
		): void => {
			if (sync) {
				for (const listener of listeners) {
					listener()
				}
			} else {
				setSnapshot(getSnapshot(instance))
			}
			memoOptions.onChange?.call(undefined, instance, sync)
		},
		[listeners, getSnapshot, memoOptions.onChange],
	)

	const resolvedOptions = useMemo<
		VirtualizerOptions<TScrollElement, TItemElement>
	>(
		() => ({
			...memoOptions,
			onChange,
		}),
		[memoOptions, onChange],
	)

	const [instance] = useState(
		() => new Virtualizer<TScrollElement, TItemElement>(resolvedOptions),
	)

	useLayoutEffect(() => {
		instance.setOptions(resolvedOptions)
		return instance._willUpdate()
	}, [listeners, instance, resolvedOptions])

	useLayoutEffect(() => {
		return instance._didMount()
	}, [instance])

	const getSnapshotʹ = useMemo(
		() => getSnapshot(instance),
		[getSnapshot, instance],
	)

	const syncSnapshot = useSyncExternalStore(subscribe, getSnapshotʹ)

	useInsertionEffect(() => {
		instRef.current.hasValue = true
		instRef.current.value = syncSnapshot
	}, [syncSnapshot])

	const [prevSyncSnapshot, setPrevSyncSnapshot] = useState(syncSnapshot)
	if (prevSyncSnapshot !== syncSnapshot) {
		setPrevSyncSnapshot(syncSnapshot)
		setSnapshot(syncSnapshot)
	}

	return snapshot === UNINITIALIZED ? syncSnapshot : snapshot
}
