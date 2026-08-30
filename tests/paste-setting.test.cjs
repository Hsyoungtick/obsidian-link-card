const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const esbuild = require("esbuild");

function loadPlugin() {
	const buildDir = mkdtempSync(path.join(tmpdir(), "link-card-test-"));
	const outputPath = path.join(buildDir, "main.cjs");
	const sourceRoot = path.resolve(__dirname, "../src").replace(/\\/g, "/");

	esbuild.buildSync({
		stdin: {
			contents: [
				`export { default as PluginClass } from "${sourceRoot}/main.ts";`,
				`export { CodeBlockGenerator } from "${sourceRoot}/code_block_generator.ts";`,
				`export { DEFAULT_SETTINGS } from "${sourceRoot}/settings.ts";`,
			].join("\n"),
			loader: "ts",
			resolveDir: path.resolve(__dirname, ".."),
		},
		bundle: true,
		external: ["obsidian"],
		format: "cjs",
		platform: "node",
		outfile: outputPath,
	});

	let requestUrl = () => new Promise(() => {});
	const fallback = () => {};
	const obsidian = new Proxy(
		{
			MarkdownView: class {},
			Notice: class {},
			Plugin: class {},
			PluginSettingTab: class {},
			moment: { locale: () => "en" },
			requestUrl: (...args) => requestUrl(...args),
		},
		{
			get(target, property) {
				return property in target ? target[property] : fallback;
			},
		}
	);

	const originalLoad = Module._load;
	Module._load = function (request, parent, isMain) {
		return request === "obsidian"
			? obsidian
			: originalLoad.call(this, request, parent, isMain);
	};

	try {
		return {
			...require(outputPath),
			setRequestUrl: (handler) => {
				requestUrl = handler;
			},
			cleanup: () => rmSync(buildDir, { recursive: true, force: true }),
		};
	} finally {
		Module._load = originalLoad;
	}
}

function createPasteScenario(PluginClass, enhanceDefaultPaste) {
	let prevented = false;
	let replacements = 0;
	const plugin = new PluginClass();

	plugin.settings = { enhanceDefaultPaste };
	plugin.app = {
		workspace: {
			getActiveViewOfType: () => ({
				editor: {
					getSelection: () => "",
					replaceSelection: () => {
						replacements += 1;
					},
				},
			}),
		},
	};

	plugin.handlePaste({
		clipboardData: { getData: () => "https://example.com" },
		preventDefault: () => {
			prevented = true;
		},
	});

	return { prevented, replacements };
}

const {
	PluginClass,
	CodeBlockGenerator,
	DEFAULT_SETTINGS,
	setRequestUrl,
	cleanup,
} = loadPlugin();
test.after(cleanup);

test("leaves a pasted URL untouched when paste enhancement is disabled", () => {
	const result = createPasteScenario(PluginClass, false);

	assert.equal(result.prevented, false);
	assert.equal(result.replacements, 0);
});

test("intercepts a pasted URL when paste enhancement is enabled", () => {
	const result = createPasteScenario(PluginClass, true);

	assert.equal(result.prevented, true);
	assert.equal(result.replacements, 1);
});

test("keeps simplified mode disabled by default", () => {
	assert.equal(DEFAULT_SETTINGS.simplifiedMode, false);
});

test("writes only a Markdown link in simplified mode", async () => {
	let content = "";
	let imageCacheChecks = 0;
	const editor = {
		getSelection: () => "",
		getValue: () => content,
		replaceSelection: (replacement) => {
			content = replacement;
		},
		replaceRange: (replacement, start, end) => {
			content = content.slice(0, start.ch) + replacement + content.slice(end.ch);
		},
	};

	setRequestUrl(async ({ url }) => {
		if (url.startsWith("https://api.microlink.io/")) {
			return {
				status: 200,
				json: { status: "success", data: { title: "Example Title" } },
			};
		}
		throw new Error("Direct request unavailable in test");
	});
	CodeBlockGenerator.settings = {
		...DEFAULT_SETTINGS,
		simplifiedMode: true,
	};
	CodeBlockGenerator.cache = null;
	CodeBlockGenerator.imageCache = {
		isEnabled: () => {
			imageCacheChecks += 1;
			return false;
		},
	};

	await new CodeBlockGenerator(editor).convertUrlToCodeBlock("https://example.com");

	assert.equal(content, "[Example Title](https://example.com)");
	assert.equal(imageCacheChecks, 0);
});
