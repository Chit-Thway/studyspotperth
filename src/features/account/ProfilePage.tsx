import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AccountProfile } from '../../domain/account';
import type { UniversityCard } from '../../domain/search-context';
import { INSTITUTION_LABELS, UNIVERSITY_CARDS } from '../libraries/presentation';
import { AccountGate } from './AccountGate';
import { useAccount } from './use-account';
import styles from './AccountPages.module.css';
import { finderUrl } from '../finder/finder-state';

function ProfileForm({ profile }: { profile: AccountProfile }) {
  const [params] = useSearchParams();
  const state = useAccount();
  const [cards, setCards] = useState<UniversityCard[]>(profile.preferences.cards);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  return <section className={styles.page}><Link className={styles.back} to={finderUrl(params)}>← Libraries</Link><div className={styles.panel}>
    <h1>Your profile</h1><p>{profile.user.name} · {profile.user.email}</p>
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault(); setStatus(''); setError('');
      void state.savePreferences({ suburbId: null, cards }).then(() => setStatus('Preferences saved.')).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Couldn’t save preferences.'));
    }}>
      <fieldset><legend>Cards I have</legend>{UNIVERSITY_CARDS.map((card) => <label className={styles.card} key={card}><input type="checkbox" checked={cards.includes(card)} onChange={() => { setCards((current) => current.includes(card) ? current.filter((value) => value !== card) : [...current, card]); setStatus(''); }} />{INSTITUTION_LABELS[card]}</label>)}<p className={styles.note}>Self-reported cards personalise results. Entry conditions apply.</p></fieldset>
      <button className={styles.button} type="submit" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save preferences'}</button>
      {status && <p className={styles.status} role="status">{status}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
    </form><p><Link to={finderUrl(params, '/saved')}>Saved libraries →</Link></p>
  </div></section>;
}
export function ProfilePage() {
  const { account } = useAccount();
  useEffect(() => { document.title = 'Your profile · StudySpot Perth'; }, []);
  return <AccountGate>{account && <ProfileForm key={account.user.id} profile={account} />}</AccountGate>;
}
