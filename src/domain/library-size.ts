export const LIBRARY_SIZES = ['small', 'medium', 'large'] as const;
export type LibrarySize = typeof LIBRARY_SIZES[number];
export const LIBRARY_SIZE_LABELS: Record<LibrarySize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
export function isLibrarySize(value: string): value is LibrarySize {
  return LIBRARY_SIZES.some((size) => size === value);
}
