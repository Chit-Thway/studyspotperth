import type { LibraryContent, WifiNetwork } from './library';
import type { UniversityCard } from './search-context';

export type RequirementMatch = 'public' | 'matches-profile' | 'not-in-profile' | 'additional-requirements' | 'unknown';
export interface WifiExplanation {
  status: 'eligible' | 'unmatched' | 'unknown';
  networks: (WifiNetwork & { match: RequirementMatch; explanation: string })[];
}

export function evaluateWifi(wifi: LibraryContent['wifi'], cards: readonly UniversityCard[]): WifiExplanation {
  const networks = wifi.networks.map((network) => {
    const match: RequirementMatch = network.kind === 'unknown' ? 'unknown'
      : network.kind === 'restricted-guest' ? 'additional-requirements'
      : network.kind === 'public' ? 'public'
      : network.eligibleCards.some((card) => cards.includes(card)) ? 'matches-profile'
      : network.eligibleCards.length ? 'not-in-profile' : 'unknown';
    const explanation = match === 'public' ? 'Public network; follow the recorded connection requirements.'
      : match === 'matches-profile' ? 'Matches your declared cards; active credentials may still be required.'
      : match === 'not-in-profile' ? 'Required university is not in your declared cards.'
      : match === 'additional-requirements' ? 'Guest access needs separate approval or credentials.'
      : 'Wi-Fi eligibility is unknown.';
    return { ...network, match, explanation };
  });
  return { status: wifi.status === 'unknown' ? 'unknown'
    : networks.some((network) => network.match === 'public' || network.match === 'matches-profile') ? 'eligible'
    : networks.some((network) => network.match === 'unknown') ? 'unknown' : 'unmatched', networks };
}
