import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LibraryPhoto } from './LibraryPhoto';
import { launchLibraries } from '../../../server/data/launch-libraries';

describe('library photo attribution', () => {
  it.each([false, true])('shows the photographer, source and licence in the %s large view', (large) => {
    const content = launchLibraries.find((record) => record.slug === 'reid-library')!.content;
    const html = renderToStaticMarkup(createElement(LibraryPhoto, { photos: content.photos, sources: content.sources, name: content.name, large }));
    expect(html).toContain('src="/images/libraries/reid-library.webp"');
    expect(html).toContain('Photographs by Gnangarra');
    expect(html).toContain('href="https://commons.wikimedia.org/wiki/File:UWA_191119_gnangarra-104.jpg"');
    expect(html).toContain('href="https://creativecommons.org/licenses/by/2.5/au/deed.en"');
    expect(html).toContain('resized');
  });
  it('keeps missing images as placeholders without unrelated photo credits', () => {
    const html = renderToStaticMarkup(createElement(LibraryPhoto, { photos: [], name: 'Library' }));
    expect(html).toContain('Photo not available');
    expect(html).not.toContain('figcaption');
  });
});
