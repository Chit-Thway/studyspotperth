import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseCatalogueImport } from './catalogue-import.ts';

/** Authoring/build tooling only: Workers serve published D1 snapshots. */
export async function readCatalogueFiles(root = resolve('catalogue')) {
  const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8')) as unknown;
  const metadata = await readJson(resolve(root, 'catalogue.json')) as { version: number; checkedOn: string };
  const libraries: unknown[] = [];
  const folders = new Map<string, string>();
  const assets = new Map<string, string>();
  for (const group of (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    for (const folder of (await readdir(resolve(root, group.name), { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const directory = resolve(root, group.name, folder.name);
      const row = await readJson(resolve(directory, 'library.json')) as { slug: string; institution: string; content: { suburbId: string } };
      if (row.slug !== folder.name || (row.institution === 'public' ? row.content.suburbId : row.institution) !== group.name) {
        throw new Error(`Library folder must match its slug and suburb/university: ${directory}`);
      }
      if (folders.has(row.slug)) throw new Error(`Duplicate library folder: ${row.slug}`);
      folders.set(row.slug, directory);
      libraries.push(row);
    }
  }
  const document = { ...metadata, suburbs: await readJson(resolve(root, 'suburbs.json')),
    wifiProfiles: await readJson(resolve(root, 'wifi-profiles.json')), libraries };
  const catalogue = parseCatalogueImport(document);
  for (const library of catalogue.libraries) for (const photo of library.content.photos) {
    if (!photo.url.startsWith('/images/libraries/') || !photo.url.endsWith('.webp') || photo.url.includes('..')) {
      throw new Error(`Catalogue photos must be local WebP assets: ${library.slug}`);
    }
    const path = resolve(folders.get(library.slug)!, 'images', basename(photo.url));
    if (!(await stat(path)).isFile()) throw new Error(`Missing catalogue photo: ${path}`);
    if (assets.has(photo.url)) throw new Error(`Duplicate catalogue image URL: ${photo.url}`);
    assets.set(photo.url, path);
  }
  return { catalogue, assets };
}
