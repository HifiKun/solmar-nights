// Solmar Nights — entry program for the gta6-01 bounty (Node 22, stdlib only).
// The game lives in this directory's game/ folder: plain static files that a
// desktop browser loads offline (game/index.html plus its ES modules and the
// vendored three.js build under game/vendor/). This program hands the entry in:
// it copies game/ and screenshots/ from beside this file into the output
// directory and writes dossier.json there with the vendored make.fun library.
//
// The grader runs this twice in a fresh container with /output writable and
// no network; outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Never remove /output itself — the grader mounts it, so deleting the
// directory fails; only clear what is inside it, then rebuild it fresh.
mkdirSync(out, { recursive: true });
for (const entry of ['game', 'screenshots', 'dossier.json']) {
  const target = join(out, entry);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's caps: text_max_bytes shapes the dossier bytes; the rest refuse
// an entry the scorer would refuse (over 4 screenshots or one over 256 KiB;
// over 993 files in game/ or 48 MiB of game files in all; a game/ path over
// 1000 bytes — game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
