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
import { cancelPostAnimationFrame, requestPostAnimationFrame } from "./postAnimationFrame"

export type ReactVirtualizer<
  TScrollElement extends Element | Window,
  TItemElement extends Element,
> = Virtualizer<TScrollElement, TItemElement>

export type ReactVirtualizerOptions<
  TScrollElement extends Element | Window,
  TItemElement extends Element,
> = VirtualizerOptions<TScrollElement, TItemElement> & {
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

export type ReactVirtualizerSnapshot<
  TScrollElement extends Element | Window,
  TItemElement extends Element,
> = Omit<
  ReactVirtualizer<TScrollElement, TItemElement>,
  "getVirtualItems" | "getVirtualIndexes" | "isAtEnd" | "getTotalSize"
> & {
  virtualItems: ReturnType<
    ReactVirtualizer<TScrollElement, TItemElement>["getVirtualItems"]
  >
  virtualIndexes: ReturnType<
    ReactVirtualizer<TScrollElement, TItemElement>["getVirtualIndexes"]
  >
  totalSize: ReturnType<
    ReactVirtualizer<TScrollElement, TItemElement>["getTotalSize"]
  >
}

export type Selector<
  TScrollElement extends Element | Window,
  TItemElement extends Element,
  Selection,
> = (
  virtualizerSnapshot: ReactVirtualizerSnapshot<TScrollElement, TItemElement>,
  virtualizer: ReactVirtualizer<TScrollElement, TItemElement>,
) => Selection

const getVirtualizerSnapshot = <
  TScrollElement extends Element | Window,
  TItemElement extends Element,
>({
  getVirtualItems,
  getVirtualIndexes,
  getTotalSize,
  ...instance
}: ReactVirtualizer<TScrollElement, TItemElement>): ReactVirtualizerSnapshot<
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
    virtualIndexes: aVirtualIndexes,
    virtualItems: aVirtualItems,
    ...a
  }: ReactVirtualizerSnapshot<TScrollElement, TItemElement>,
  {
    options: bOptions,
    virtualIndexes: bVirtualIndexes,
    virtualItems: bVirtualItems,
    ...b
  }: ReactVirtualizerSnapshot<TScrollElement, TItemElement>,
): boolean =>
  isShallowEqual(aOptions, bOptions)
  && isShallowEqual(aVirtualIndexes, bVirtualIndexes)
  && isShallowEqual(aVirtualItems, bVirtualItems)
  && isShallowEqual(a, b)

export const useVirtualizerBase = <
  TScrollElement extends Element | Window,
  TItemElement extends Element,
  Selection = ReactVirtualizerSnapshot<TScrollElement, TItemElement>,
>(
  {
    useFlushSync = true,
    directDomUpdates = false,
    directDomUpdatesMode = "transform",
    directDomContainer = null,
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

  const { horizontal = false, scrollMargin = 0 } = options
  const axis = horizontal ? "width" : "height"
  const useTransform = directDomUpdatesMode === "transform"

  const [totalSize, setTotalSize] = useState<number | null>(null)

  // Keyed by the element itself so a remounted node (same key, new DOM
  // node — e.g. when `enabled` is toggled off then on) is treated as fresh
  // and gets its style written.
  const [lastPositions] = useState(() => new WeakMap<HTMLElement, number>())
  const [originalPositions] = useState(() => new WeakMap<HTMLElement, string>())

  const [instance] = useState(
    () => new Virtualizer<TScrollElement, TItemElement>(options),
  )

  useLayoutEffect(() => {
    if (!directDomUpdates || !directDomContainer || totalSize == null) {
      return
    }

    let originalSize = ""

    let handle = requestPostAnimationFrame(() => {
      originalSize = directDomContainer.style.getPropertyValue(axis)
      handle = requestAnimationFrame(() => {
        directDomContainer.style.setProperty(axis, `${totalSize}px`)
      })
    })

    return () => {
      setTotalSize(null)
      cancelAnimationFrame(handle)
      cancelPostAnimationFrame(handle)
      requestAnimationFrame(() => {
        directDomContainer?.style.setProperty(axis, originalSize)
      })
    }
  }, [axis, directDomContainer, directDomUpdates, totalSize])

  useLayoutEffect(() => {
    if (!directDomUpdates || !directDomContainer) {
      return
    }

    return () => {
      requestAnimationFrame(() => {
        const items = instance.getVirtualItems()
        for (const item of items) {
          const el = instance.elementsCache.get(item.key) as
            | HTMLElement
            | undefined
          if (!el) continue
          lastPositions.delete(el)
          const originalPosition = originalPositions.get(el)
          if (originalPosition == null) continue
          originalPositions.delete(el)
          if (useTransform) {
            el.style.setProperty("transform", originalPosition)
          } else {
            el.style.setProperty(axis, originalPosition)
          }
        }
      })
    }
  }, [
    axis,
    directDomContainer,
    directDomUpdates,
    instance,
    lastPositions,
    originalPositions,
    useTransform,
  ])

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
      memoizedVirtualizerSnapshot: ReactVirtualizerSnapshot<
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

  // Writes container size + item positions to the DOM. Idempotent — guarded
  // by lastSize / lastPositions. Called from onChange (covers scroll-driven
  // updates) and from a layout effect (covers post-render commits when refs
  // have just registered new items in elementsCache).
  const applyDirectStyles = useCallback(
    (instance: ReactVirtualizer<TScrollElement, TItemElement>) => {
      if (!directDomUpdates || !directDomContainer) return

      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setTotalSize(instance.getTotalSize())

      const items = instance.getVirtualItems()
      for (const item of items) {
        const next = item.start - scrollMargin
        const el = instance.elementsCache.get(item.key) as
          | HTMLElement
          | undefined
        if (!el) continue
        if (lastPositions.get(el) === next) continue

        if (!originalPositions.has(el)) {
          if (useTransform) {
            originalPositions.set(el, el.style.getPropertyValue("transform"))
          } else {
            originalPositions.set(el, el.style.getPropertyValue(axis))
          }
        }

        lastPositions.set(el, next)
        if (useTransform) {
          el.style.setProperty(
            "transform",
            horizontal ?
              `translate3d(${next}px, 0, 0)`
            : `translate3d(0, ${next}px, 0)`,
          )
        } else {
          el.style.setProperty(axis, `${next}px`)
        }
      }
    },
    [
      axis,
      directDomContainer,
      directDomUpdates,
      horizontal,
      lastPositions,
      originalPositions,
      scrollMargin,
      useTransform,
    ],
  )

  const onChange = useCallback(
    (
      instance: ReactVirtualizer<TScrollElement, TItemElement>,
      sync: boolean,
    ): void => {
      applyDirectStyles(instance)

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
