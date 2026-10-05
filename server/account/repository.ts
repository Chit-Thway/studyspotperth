import type { AccountProfile, Preferences } from '../../src/domain/account';
import type { UniversityCard } from '../../src/domain/search-context';
import { parseLibraryContent } from '../../src/domain/parse-library';
import type { LibraryRecord } from '../../src/domain/library';
import { AccountError } from './session';

export function createAccountRepository(env: Env, options: { includeFixtures?: boolean } = {}) {
  const fixtureClause = options.includeFixtures ? '' : ' AND l.is_fixture = 0';
  async function profile(user: AccountProfile['user']): Promise<AccountProfile> {
    const [preference, cards, favourites, role] = await Promise.all([
      env.DB.prepare('SELECT p.suburb_id FROM user_preferences p LEFT JOIN suburb s ON s.id = p.suburb_id WHERE p.user_id = ? AND (p.suburb_id IS NULL OR s.is_fixture = 0)').bind(user.id).first<{ suburb_id: string | null }>(),
      env.DB.prepare('SELECT institution_id FROM user_card WHERE user_id = ? ORDER BY institution_id').bind(user.id).all<{ institution_id: UniversityCard }>(),
      env.DB.prepare(`SELECT f.library_id FROM favourite f INNER JOIN library l ON l.id = f.library_id INNER JOIN library_revision r ON r.library_id = l.id AND r.status = 'published' WHERE f.user_id = ?${fixtureClause}`).bind(user.id).all<{ library_id: string }>(),
      env.DB.prepare('SELECT role FROM user_role WHERE user_id = ?').bind(user.id).first<{ role: string }>(),
    ]);
    return { user: { id: user.id, name: user.name, email: user.email }, preferences: { suburbId: preference?.suburb_id ?? null, cards: cards.results.map((row) => row.institution_id) }, favouriteIds: favourites.results.map((row) => row.library_id), isAdmin: role?.role === 'admin' };
  }
  async function savePreferences(userId: string, preferences: Preferences) {
    const suburbId = preferences.suburbId === 'perth-cbd' ? null : preferences.suburbId;
    if (suburbId && !await env.DB.prepare('SELECT id FROM suburb WHERE id = ? AND is_fixture = 0').bind(suburbId).first()) throw new AccountError(400, 'Select an available suburb.');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO user_preferences(user_id, suburb_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET suburb_id = excluded.suburb_id').bind(userId, suburbId),
      env.DB.prepare('DELETE FROM user_card WHERE user_id = ?').bind(userId),
      ...preferences.cards.map((card) => env.DB.prepare('INSERT INTO user_card(user_id, institution_id) VALUES (?, ?)').bind(userId, card)),
    ]);
  }
  async function favourite(userId: string, libraryId: string, save: boolean) {
    if (save) {
      const record = await env.DB.prepare(`SELECT l.id FROM library l INNER JOIN library_revision r ON r.library_id = l.id AND r.status = 'published' WHERE l.id = ?${fixtureClause}`).bind(libraryId).first();
      if (!record) throw new AccountError(404, 'This library is not available.');
      await env.DB.prepare('INSERT INTO favourite(user_id, library_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(userId, libraryId).run();
    } else await env.DB.prepare('DELETE FROM favourite WHERE user_id = ? AND library_id = ?').bind(userId, libraryId).run();
  }
  async function saved(userId: string): Promise<LibraryRecord[]> {
    const rows = await env.DB.prepare(`SELECT l.id, l.slug, l.institution_id AS institution, l.is_fixture AS isFixture, r.id AS revisionId, r.status, r.content FROM favourite f INNER JOIN library l ON l.id = f.library_id INNER JOIN library_revision r ON r.library_id = l.id AND r.status = 'published' WHERE f.user_id = ?${fixtureClause} ORDER BY l.slug`).bind(userId).all<Omit<LibraryRecord, 'content' | 'isFixture'> & { content: string; isFixture: number }>();
    return rows.results.map((row) => ({ ...row, isFixture: Boolean(row.isFixture), content: parseLibraryContent(JSON.parse(row.content)) }));
  }
  return { profile, savePreferences, favourite, saved };
}
