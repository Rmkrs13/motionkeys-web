// Bouwt de extensie naar dist/: bundelt de TypeScript-entrypoints met esbuild en kopieert
// manifest, html/css, iconen, het pose-model en de MediaPipe-WASM-bestanden.
// `node build.mjs` eenmalig, `node build.mjs --watch` bouwt opnieuw bij elke wijziging.
import * as esbuild from 'esbuild';
import { cp, mkdir, rm, access, writeFile } from 'node:fs/promises';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const out = 'dist';
const modelURL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const modelPath = 'public/models/pose_landmarker_lite.task';

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function ensureModel() {
  if (await exists(modelPath)) return;
  console.log('Pose-model downloaden…');
  const res = await fetch(modelURL);
  if (!res.ok) throw new Error(`Model downloaden mislukt: ${res.status}`);
  await mkdir(path.dirname(modelPath), { recursive: true });
  await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
}

async function copyStatic() {
  await mkdir(out, { recursive: true });
  await cp('manifest.json', `${out}/manifest.json`);
  await cp('public', out, { recursive: true });
  await cp('node_modules/@mediapipe/tasks-vision/wasm', `${out}/wasm`, { recursive: true });
  for (const f of ['src/panel/panel.html', 'src/panel/panel.css']) {
    await cp(f, `${out}/${path.basename(f)}`);
  }
}

const copyPlugin = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length === 0) {
        await copyStatic();
        console.log(`[${new Date().toLocaleTimeString()}] gebouwd → ${out}/`);
      }
    });
  },
};

await rm(out, { recursive: true, force: true });
await ensureModel();

const ctx = await esbuild.context({
  entryPoints: {
    panel: 'src/panel/panel.ts',
    background: 'src/background.ts',
    content: 'src/content.ts',
  },
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  outdir: out,
  sourcemap: true,
  logLevel: 'warning',
  plugins: [copyPlugin],
});

if (watch) {
  await ctx.watch();
  console.log('Wachten op wijzigingen…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
