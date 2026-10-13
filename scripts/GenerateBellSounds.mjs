import { synthesizeBell, encodeWav } from './BellSynth.ts';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

// Tone reference only (docs/Spec.md §5.4); the app synthesizes the bell in real time.
const repoPath = fileURLToPath(new URL('..', import.meta.url));
const outputPath = join(repoPath, 'scripts/output/bell-reference.wav');

const bellWav = encodeWav(synthesizeBell());

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, bellWav);
console.log(`✓ ${outputPath} (${bellWav.byteLength} bytes)`);
