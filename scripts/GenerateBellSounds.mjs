import { synthesizeBell, createSilence, encodeWav } from './BellSynth.ts';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const repoRoot = new URL('..', import.meta.url);
const repoPath = fileURLToPath(repoRoot);

const outputPaths = [
  join(repoPath, 'modules/bearbell-engine/ios/Assets/bell.wav'),
  join(repoPath, 'modules/bearbell-engine/ios/Assets/silence.wav'),
  join(repoPath, 'modules/bearbell-engine/android/src/main/res/raw/bearbell_bell.wav'),
];

const bell = synthesizeBell();
const silence = createSilence(1);
const bellWav = encodeWav(bell);
const silenceWav = encodeWav(silence);

const dirsToCreate = new Set(outputPaths.map((p) => dirname(p)));

for (const dir of dirsToCreate) {
  mkdirSync(dir, { recursive: true });
}

writeFileSync(outputPaths[0], bellWav);
console.log(`✓ ${outputPaths[0]} (${bellWav.byteLength} bytes)`);

writeFileSync(outputPaths[1], silenceWav);
console.log(`✓ ${outputPaths[1]} (${silenceWav.byteLength} bytes)`);

writeFileSync(outputPaths[2], bellWav);
console.log(`✓ ${outputPaths[2]} (${bellWav.byteLength} bytes)`);
