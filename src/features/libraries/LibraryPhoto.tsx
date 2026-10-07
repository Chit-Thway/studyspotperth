import { useState } from 'react';
import type { LibraryPhoto as PhotoRecord, SourceRecord } from '../../domain/library';
import { Icon } from './Icon';
import styles from './Libraries.module.css';

export function LibraryPhoto({ photos, sources = [], name, large = false }: { photos: PhotoRecord[]; sources?: SourceRecord[]; name: string; large?: boolean }) {
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const photo = photos[selected];
  const available = photo && !failed.includes(photo.url);
  const source = sources.find((item) => item.id === photo?.sourceId);
  const licence = sources.find((item) => item.id === `${photo?.sourceId}-license`);
  return <figure className={`${styles.photo} ${large ? styles.heroPhoto : ''}`}>
    {available ? <img src={photo.url} alt={photo.alt} loading={large ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onError={() => setFailed((urls) => [...urls, photo.url])} />
      : <div className={styles.photoPlaceholder}><Icon name="book" /><span>Photo not available</span></div>}
    {large && photos.length > 1 && <div className={styles.photoChoices} aria-label="Library photos">
      {photos.slice(0, 6).map((item, index) => <button type="button" key={`${item.url}-${index}`} aria-label={`View photo ${index + 1} of ${name}`} aria-pressed={index === selected} onClick={() => setSelected(index)}>{index + 1}</button>)}
    </div>}
    {available && photo.credit && <figcaption>
      {source?.url ? <a href={source.url} target="_blank" rel="noreferrer">{photo.credit}</a> : photo.credit}
      {licence?.url && <> · <a href={licence.url} target="_blank" rel="noreferrer">{licence.label}</a> · resized</>}
    </figcaption>}
  </figure>;
}
