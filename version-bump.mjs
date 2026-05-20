import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;

if (targetVersion) {
  manifest.version = targetVersion;
}
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[manifest.version] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

console.log(`版本已更新: ${manifest.version} (minAppVersion: ${minAppVersion})`);
