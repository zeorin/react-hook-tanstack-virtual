# React Hook TanStack Virtual

[Rules of React](https://react.dev/reference/rules) respecting bindings for [TanStack Virtual](https://tanstack.com/virtual).

Because these hooks respect the Rules of React, they are compatible with the React Compiler, or just memoization in general.

## Usage

Install this package and its peer dependencies:

```sh
yarn install react-hook-tanstack-virtual @tanstack/virtual-core @tanstack/react-virtual
```

`react-hook-tanstack-virtual` is a drop-in replacement for `@tanstack/react-virtual`.

## How it works

Our hooks create a `virtualizer` instance, and hook into its `onChange` handler to listen to state changes, and then they subscribe to these changes using React's [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore), and run the getters on the relevant part of TanStack Virtual's API. You can then select the parts of the state that you need.

## Hooks

### `useVirtualizer`

```typescript
import { useVirtualizer } from 'react-hook-tanstack-virtual'

const Component = () => {
	// …

	const {
		totalSize,
		virtualItems
	} = useVirtualizer(options, (virtualizer) => ({
		totalSize: virtualizer.totalSize,
		virtualItems: virtualizer.virtualItems
	}))
}
```

### `useWindowVirtualizer`

```typescript
import { useWindowVirtualizer } from 'react-hook-tanstack-virtual'

const Component = () => {
	// …

	const {
		totalSize,
		virtualItems
	} = useWindowVirtualizer(options, (virtualizer) => ({
		totalSize: virtualizer.totalSize,
		virtualItems: virtualizer.virtualItems
	}))
}
```

## See also

If you use [TanStack Table](https://tanstack.com/table), you may be interested in our sister package, [`react-hook-tanstack-table`](https://www.npmjs.com/package/react-hook-tanstack-table).
