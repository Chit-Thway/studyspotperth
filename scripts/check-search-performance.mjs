import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('.runtime-check', { recursive: true });
const output = resolve('.runtime-check/search-performance.mjs');
await build({ stdin: { contents: `
  export { scaleCatalogue } from './tests/fixtures/catalogue-scale';
  export { searchLibraries } from './src/domain/library-search';
  export { parseSearchRequest } from './src/domain/search-request';
  export { parseLibraryContent } from './src/domain/parse-library';
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: output });
const { scaleCatalogue, searchLibraries, parseSearchRequest, parseLibraryContent } = await import(pathToFileURL(output).href);
const clock = Date.parse('2026-10-12T06:00:00Z');
for (const count of [82, 100]) {
  const source = scaleCatalogue(count);
  for (const query of ['', 'cards=uwa&open24Hours=true', 'publicAccess=true', 'usableWifi=true']) {
    const request = parseSearchRequest(new URLSearchParams(query), clock);
    const samples = [];
    let bytes = 0;
    const run = () => {
      const records = source.map((record) => ({ ...record, content: parseLibraryContent(record.content) }));
      const result = searchLibraries(records, request);
      assert(result.results.length <= 10);
      bytes = Buffer.byteLength(JSON.stringify({ ...result, request, timeZone: 'Australia/Perth' }));
      return bytes;
    };
    const coldStart = performance.now(); run(); const firstMs = performance.now() - coldStart;
    for (let warmup = 0; warmup < 5; warmup++) run();
    const cpuStart = process.cpuUsage();
    for (let sample = 0; sample < 40; sample++) {
      const start = performance.now(); run(); samples.push(performance.now() - start);
    }
    const cpu = process.cpuUsage(cpuStart);
    samples.sort((a, b) => a - b);
    console.log(JSON.stringify({ records: count, query: query || 'default', firstMs: +firstMs.toFixed(2),
      medianMs: +samples[20].toFixed(2), p95Ms: +samples[38].toFixed(2),
      averageCpuMs: +((cpu.user + cpu.system) / 1000 / samples.length).toFixed(2), responseBytes: bytes }));
  }
}
console.log('Local Node measurements include validation, ranking and serialization, excluding D1/network time. They are not Cloudflare edge CPU measurements.');
