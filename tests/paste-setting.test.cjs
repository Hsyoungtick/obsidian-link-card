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

	esbuild.buildSync({
		entryPoints: [path.resolve(__dirname, "../src/main.ts")],
		bundle: true,
		external: ["obsidian"],
		format: "cjs",
		platform: "node",
		outfile: outputPath,
	});

	const fallback = () => {};
	const obsidian = new Proxy(
		{
			MarkdownView: class {},
			Notice: class {},
			Plugin: class {},
			PluginSettingTab: class {},
			moment: { locale: () => "en" },
			requestUrl: () => new Promise(() => {}),
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
			PluginClass: require(outputPath).default,
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

const { PluginClass, cleanup } = loadPlugin();
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
