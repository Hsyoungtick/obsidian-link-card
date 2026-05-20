import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

function run(cmd) {
	console.log(`> ${cmd}`);
	execSync(cmd, { stdio: "inherit" });
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = newVersion;
writeFileSync("package.json", JSON.stringify(pkg, null, "\t"));
console.log(`版本号: ${pkg.version} -> ${newVersion}`);

let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = newVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[newVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

console.log(`manifest.json 和 versions.json 已更新: ${newVersion}`);

run("git add .");
run(`git commit -m "chore: release ${newVersion}"`);
run(`git tag ${newVersion}`);
run("git pull --rebase");
run("git push");
run("git push --tags");

console.log(`发布完成: v${newVersion}`);
