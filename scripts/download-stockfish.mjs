import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const engineVersion = "19.0.1";
const engineName = `stockfish-${engineVersion.split(".")[0]}-lite-single`;
const engineDirectory = fileURLToPath(new URL("../public/engine/", import.meta.url));
const releaseUrl = `https://github.com/nmrugg/stockfish.js/releases/download/v${engineVersion}`;
const assets = [
  {
    file: `${engineName}.js`,
    url: `${releaseUrl}/${engineName}.js`,
  },
  {
    file: `${engineName}.wasm`,
    url: `${releaseUrl}/${engineName}.wasm`,
  },
  {
    file: "Copying.txt",
    url: `https://raw.githubusercontent.com/nmrugg/stockfish.js/v${engineVersion}/Copying.txt`,
  },
];

await mkdir(engineDirectory, { recursive: true });

for (const asset of assets) {
  const destination = fileURLToPath(
    new URL(`../public/engine/${asset.file}`, import.meta.url),
  );

  try {
    const existing = await stat(destination);
    if (existing.size > 0) continue;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(
      `Gagal mengunduh ${asset.file} dari Stockfish: HTTP ${response.status}.`,
    );
  }

  const contents = new Uint8Array(await response.arrayBuffer());
  if (contents.length < 512) {
    throw new Error(`Berkas Stockfish ${asset.file} terlalu kecil atau tidak valid.`);
  }

  const temporaryFile = `${destination}.download`;
  await writeFile(temporaryFile, contents);
  await rename(temporaryFile, destination);
  console.log(`Stockfish ${asset.file} siap.`);
}
