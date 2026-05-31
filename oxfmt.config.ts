import { defineConfig } from "oxfmt"

export default defineConfig({
	printWidth: 80,
	useTabs: true,
	semi: false,
	sortImports: true,
	sortPackageJson: true,
	jsdoc: true,
	ignorePatterns: ["/.yarn/sdks/"],
})
