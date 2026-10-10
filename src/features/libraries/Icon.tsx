export type IconName = 'book' | 'clock' | 'pin' | 'wifi' | 'person' | 'people' | 'crowd' | 'access' | 'heart' | 'arrow' | 'check' | 'filter' | 'close';
const paths: Record<IconName, string> = {
  book: 'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l4 2',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  wifi: 'M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0M12 20h.01',
  people: 'M9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM17 4a3 3 0 0 1 0 6M3 20v-3a6 6 0 0 1 12 0v3ZM17 14a5 5 0 0 1 4 5v1',
  person: 'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 21v-4a6 6 0 0 1 12 0v4Z',
  crowd: 'M3 4a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 3 4ZM9 4a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 9 4ZM15 4a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 15 4ZM21 4a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 21 4ZM1 20v-7a2 2 0 0 1 4 0v7ZM7 20v-7a2 2 0 0 1 4 0v7ZM13 20v-7a2 2 0 0 1 4 0v7ZM19 20v-7a2 2 0 0 1 4 0v7Z',
  access: 'M12 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM12 9v5h5l3 6M12 11H8M9 12a5 5 0 1 0 6 8',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  arrow: 'M4 12h16M14 6l6 6-6 6', check: 'm5 12 4 4L19 6', filter: 'M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M9 16v4', close: 'm6 6 12 12M6 18 18 6',
};
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg className={className} data-icon={name} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
