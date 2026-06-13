let nextHandle = 1
let currentlyRunning = false

interface Task<Args extends unknown[]> {
	callback: (...args: Args) => unknown
	args: Args
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tasks = new Map<number, Task<any[]>>()

const run = <Args extends unknown[]>({ callback, args }: Task<Args>) =>
	// eslint-disable-next-line prefer-spread
	callback.apply(undefined, args)

const runIfPresent = (handle: number) => {
	if (currentlyRunning) {
		setImmediate(runIfPresent, handle)
		return
	}

	const task = tasks.get(handle)

	if (!task) return

	currentlyRunning = true
	try {
		run(task)
	} finally {
		clearImmediate(handle)
		currentlyRunning = false
	}
}

const impl =
	"scheduler" in globalThis ?
		{
			/** Schedule a callback to be run in event queue, at the start if possible */
			setImmediate: <Args extends unknown[]>(
				callback: (...args: Args) => void,
				...args: Args
			): number => {
				const handle = nextHandle++
				tasks.set(handle, { callback, args })
				// eslint-disable-next-line compat/compat -- we are feature detecting before using this API
				void scheduler.postTask(() => runIfPresent(handle), {
					priority: "user-blocking",
				})
				return handle
			},
			clearImmediate: (handle: number): void => {
				tasks.delete(handle)
			},
		}
	: (() => {
			const channel = new MessageChannel()
			channel.port1.onmessage = function (event) {
				const handle: number = event.data
				runIfPresent(handle)
			}
			const port = channel.port2
			return {
				/** Schedule a callback to be run in event queue, at the start if possible */
				setImmediate: <Args extends unknown[]>(
					callback: (...args: Args) => void,
					...args: Args
				): number => {
					const handle = nextHandle++
					tasks.set(handle, { callback, args })
					port.postMessage(handle)
					return handle
				},
				clearImmediate: (handle: number): void => {
					tasks.delete(handle)
				},
			}
		})()

/** Schedule a callback to be run in the event queue (i.e. macrotask), at the start if possible */
export const setImmediate: <Args extends unknown[]>(
	callback: (...args: Args) => void,
	...args: Args
) => number = impl.setImmediate
export const clearImmediate: (handle: number) => void = impl.clearImmediate
