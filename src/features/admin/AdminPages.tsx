import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { AdminLibrary, AdminList } from '../../domain/admin';
import { emptyLibraryContent, parseAdminContent } from '../../domain/admin';
import type { LibraryContent } from '../../domain/library';
import type { Institution } from '../../domain/search-context';
import { formatPerthTime } from '../../domain/perth-time';
import { AccountGate } from '../account/AccountGate';
import { useAccount } from '../account/use-account';
import { accountRequest, AccountApiError } from '../account/client';
import { useLibraryApi } from '../libraries/use-library-api';
import { LibraryDetailContent } from '../libraries/LibraryDetailPage';
import type { DetailResponse, OriginsResponse } from '../libraries/api';
import { LibraryApiError } from '../libraries/api';
import { INSTITUTION_LABELS, UNIVERSITY_CARDS } from '../libraries/presentation';
import { Field, Choice } from './Fields';
import { ContentEditor } from './ContentEditor';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { afterUnpublish } from './editor-state';
import { UsageStats } from './UsageStats';
import styles from './Admin.module.css';

function AccessFailure({ error, retry }: { error: Error | null; retry: () => void }) {
  const denied = error instanceof LibraryApiError && [401, 403].includes(error.status);
  return <div className={styles.section} role="alert"><h1>{denied ? 'Administrator access required' : 'Couldn’t load administration'}</h1><p>{error?.message}</p><button className={styles.secondary} type="button" onClick={retry}>Try again</button> <Link to="/">Browse libraries</Link></div>;
}
function Dashboard() {
  const [params] = useSearchParams();
  const resource = useLibraryApi<AdminList>(`/api/admin/libraries?${new URLSearchParams({ after: params.get('after') ?? '' })}`);
  if (resource.error) return <AccessFailure error={resource.error} retry={resource.retry} />;
  return <section className={styles.page}><div className={styles.heading}><div><p className={styles.note}>Administration</p><h1>Manage libraries</h1></div><Link className={styles.button} to="/admin/libraries/new">Add library</Link></div>
    <UsageStats />
    {resource.loading && <p role="status">Loading libraries…</p>}
    {resource.data && !resource.data.libraries.length && <div className={styles.section}><p>No library records yet.</p></div>}
    <div className={styles.list}>{resource.data?.libraries.map(({ record, publishedRevisionId }) => <article className={styles.listItem} key={record.id}>
      <div><h2><Link to={`/admin/libraries/${record.id}`}>{record.content.name}</Link></h2><p>{INSTITUTION_LABELS[record.institution]} · /libraries/{record.slug}</p></div>
      <span className={styles.badge}>{publishedRevisionId ? record.status === 'draft' ? 'Published · draft changes' : 'Published' : 'Unpublished'}</span>
      <Link className={styles.secondary} to={`/admin/libraries/${record.id}`}>Edit library</Link>
    </article>)}</div>
    <div className={styles.actions}>{params.has('after') && <Link to="/admin">First page</Link>}{resource.data?.nextSlug && <Link to={`/admin?${new URLSearchParams({ after: resource.data.nextSlug })}`}>Next page →</Link>}</div>
  </section>;
}

function LibraryEditor({ initial }: { initial?: AdminLibrary }) {
  const navigate = useNavigate();
  const origins = useLibraryApi<OriginsResponse>('/api/suburbs');
  const [saved, setSaved] = useState(initial);
  const [content, setContent] = useState<LibraryContent>(initial?.record.content ?? emptyLibraryContent());
  const [slug, setSlug] = useState(initial?.record.slug ?? '');
  const [institution, setInstitution] = useState<Institution>(initial?.record.institution ?? 'public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<DetailResponse | null>(null);
  const [at, setAt] = useState(formatPerthTime(Date.now()).slice(0, 16));
  const [cards, setCards] = useState('');
  const errorPanel = useRef<HTMLParagraphElement>(null);
  const createdAndSaved = useRef(false);
  const dirty = !saved || JSON.stringify(content) !== JSON.stringify(saved.record.content);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !createdAndSaved.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (error) errorPanel.current?.focus(); }, [error]);
  function change(value: LibraryContent) { setContent(value); setPreview(null); setStatus(''); }
  async function run(action: 'save' | 'preview' | 'publish' | 'unpublish') {
    if (busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      let payload: AdminLibrary;
      if (action === 'save') {
        const canonical = parseAdminContent(content);
        if (!saved) {
          payload = await accountRequest<AdminLibrary>('/api/admin/libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, institution, content: canonical }) });
          createdAndSaved.current = true;
          void navigate(`/admin/libraries/${payload.record.id}`, { replace: true }); return;
        }
        payload = await accountRequest<AdminLibrary>(`/api/admin/libraries/${saved.record.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevisionId: saved.record.revisionId, content: canonical }) });
      } else {
        if (!saved) throw new Error('Save the new library before previewing.');
        if (action === 'preview') {
          const query = new URLSearchParams({ start: at, cards });
          const result = await accountRequest<DetailResponse>(`/api/admin/libraries/${saved.record.id}/preview?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: parseAdminContent(content) }) });
          setPreview(result); setStatus('Draft preview ready.'); return;
        }
        if (action === 'publish' && dirty) throw new Error('Save your changes before publishing.');
        if (!window.confirm(action === 'publish' ? 'Publish this saved draft for all visitors?' : 'Remove this library from public results?')) return;
        payload = await accountRequest<AdminLibrary>(`/api/admin/libraries/${saved.record.id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisionId: action === 'publish' ? saved.record.revisionId : saved.publishedRevisionId }) });
      }
      setSaved((current) => action === 'unpublish' && current ? afterUnpublish(current, payload) : payload);
      // Unpublishing must not discard unsaved editor changes.
      if (action !== 'unpublish') { setContent(payload.record.content); setPreview(null); }
      setStatus(action === 'save' ? 'Draft saved. Public version unchanged.' : action === 'publish' ? 'Library published.' : 'Library unpublished.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Couldn’t update this library.');
      if (failure instanceof AccountApiError && [401, 403].includes(failure.status)) setPreview(null);
    } finally { setBusy(false); }
  }
  return <section className={styles.page}>
    <UnsavedChangesDialog shouldBlock={() => dirty && !createdAndSaved.current} />
    <Link to="/admin" className={styles.back}>← Manage libraries</Link>
    <div className={styles.heading}><h1>{saved ? 'Edit library' : 'Add library'}</h1><span className={styles.badge}>{saved?.publishedRevisionId ? 'Published' : 'Unpublished'}{dirty && ' · unsaved changes'}</span></div>
    {error && <p ref={errorPanel} tabIndex={-1} className={styles.error} role="alert">{error}</p>}{status && <p role="status" className={styles.status}>{status}</p>}
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void run('save'); }}>
      <fieldset disabled={busy} className={styles.controls}>
        {!saved ? <fieldset className={styles.section}><legend>Library address and institution</legend><div className={styles.row}>
          <Field label="URL slug" value={slug} onChange={setSlug} required /><Choice label="Institution" value={institution} options={Object.entries(INSTITUTION_LABELS).map(([key, label]) => [key as Institution, label] as const)} onChange={setInstitution} />
        </div></fieldset> : <p className={styles.note}>{INSTITUTION_LABELS[saved.record.institution]} · /libraries/{saved.record.slug}. The URL and institution stay fixed; name and details can be edited below.</p>}
        <ContentEditor content={content} onChange={change} origins={origins.data?.origins ?? []} />
        {origins.error && <p role="alert">Suburbs couldn’t load. <button type="button" className={styles.secondary} onClick={origins.retry}>Try again</button></p>}
        <div className={styles.actions}><button className={styles.button} type="submit">{busy ? 'Working…' : 'Save draft'}</button>
          {saved && <><button className={styles.secondary} type="button" disabled={dirty || saved.record.status !== 'draft'} onClick={() => { void run('publish'); }}>Publish draft</button>
            <button className={styles.secondary} type="button" disabled={!saved.publishedRevisionId} onClick={() => { void run('unpublish'); }}>Unpublish</button></>}
          <button className={styles.secondary} type="button" onClick={() => { if (!dirty || window.confirm('Reload and discard unsaved changes?')) window.location.reload(); }}>Reload record</button>
        </div>
        {saved && <fieldset className={styles.section}><legend>Draft preview</legend><div className={styles.row}>
          <Field label="Preview time (Perth)" type="datetime-local" value={at} onChange={(value) => { setAt(value); setPreview(null); }} />
          <Choice label="Visitor card" value={cards} options={[["", 'Guest'], ...UNIVERSITY_CARDS.map((card) => [card, INSTITUTION_LABELS[card]] as const)]} onChange={(value) => { setCards(value); setPreview(null); }} />
        </div><button className={styles.secondary} type="button" onClick={() => { void run('preview'); }}>Preview draft</button><p className={styles.note}>Preview includes unsaved edits. 24/7 is calculated from building and entry hours.</p></fieldset>}
      </fieldset>
    </form>
    {preview && <section className={styles.preview} aria-label="Draft preview"><p className={styles.badge}>Draft preview · not public</p><LibraryDetailContent result={preview.result} originName={preview.request.origin.name} preview /></section>}
  </section>;
}

function EditPage() {
  const { id = '' } = useParams();
  const resource = useLibraryApi<AdminLibrary>(`/api/admin/libraries/${encodeURIComponent(id)}`);
  if (resource.error) return <AccessFailure error={resource.error} retry={resource.retry} />;
  if (!resource.data) return <p role="status">Loading library…</p>;
  return <LibraryEditor key={resource.data.record.revisionId} initial={resource.data} />;
}
function AdminGate({ children }: { children: React.ReactNode }) {
  const { account } = useAccount();
  return <AccountGate>{account?.isAdmin ? children : <section className={styles.page}><h1>Administrator access required</h1><p>This account cannot manage libraries.</p><Link to="/">Browse libraries</Link></section>}</AccountGate>;
}
export function AdminDashboard() { return <AdminGate><Dashboard /></AdminGate>; }
export function AdminNewPage() { return <AdminGate><LibraryEditor /></AdminGate>; }
export function AdminEditPage() { return <AdminGate><EditPage /></AdminGate>; }
