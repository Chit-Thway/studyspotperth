import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LibraryPhoto, LibraryPhotoCredits } from './LibraryPhoto';
import { launchLibraries } from '../../../server/data/launch-libraries';

describe('library photo attribution', () => {
  it.each([false, true])('keeps references off the image in the %s large view', (large) => {
    const content = launchLibraries.find((record) => record.slug === 'reid-library')!.content;
    const photos = content.photos.map((photo) => ({ ...photo, caption: 'Interior views after refurbishment' }));
    const html = renderToStaticMarkup(createElement(LibraryPhoto, { photos, name: content.name, large }));
    expect(html).toContain('src="/images/libraries/reid-library.webp"');
    expect(html).not.toContain('figcaption');
    expect(html).not.toContain('Interior views after refurbishment');
    expect(html).not.toContain('Photographs by Gnangarra');
  });
  it('preserves credit, source, licence and modification notice in the references list', () => {
    const content = launchLibraries.find((record) => record.slug === 'reid-library')!.content;
    const html = renderToStaticMarkup(createElement(LibraryPhotoCredits, { photos: content.photos, sources: content.sources }));
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
