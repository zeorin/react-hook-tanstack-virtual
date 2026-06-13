import { setImmediate } from "./immediate"

let nextHandle = 1

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
	const task = tasks.get(handle)
	if (!task) return
	try {
		run(task)
	} finally {
		cancelPostAnimationFrame(handle)
	}
}

/** Schedule a callback to be run after a frame is painted */
export const requestPostAnimationFrame = <Args extends unknown[]>(
	callback: (...args: Args) => void,
	...args: Args
): number => {
	const handle = nextHandle++
	tasks.set(handle, { callback, args })
	requestAnimationFrame(() => setImmediate(() => runIfPresent(handle)))
	return handle
}

export const cancelPostAnimationFrame = (handle: number): void => {
	tasks.delete(handle)
}
