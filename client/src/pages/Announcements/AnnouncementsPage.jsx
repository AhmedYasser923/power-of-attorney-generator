import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  askAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements
} from '../../api/announcements.js';
import { useAuth } from '../../context/AuthContext.jsx';
import './AnnouncementsPage.css';

const getAnnouncementId = (announcement) => String(announcement?._id || announcement?.id || '');

const getTodayValue = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const formatDate = (value) => {
  if (!value) return '-';

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const sanitizeAnnouncementHtml = (html) => DOMPurify.sanitize(String(html || ''), {
  ALLOWED_TAGS: ['strong', 'ul', 'li', 'br', 'span'],
  ALLOWED_ATTR: ['style']
});

function SourceChip({ source, disabled, onClick }) {
  return (
    <button
      className="announcement-source-chip"
      disabled={disabled}
      onClick={() => onClick(source.id)}
      type="button"
    >
      <strong>{source.subject || 'Announcement'}</strong>
      <span>{formatDate(source.date)} / {source.announcer || 'Unknown'}</span>
    </button>
  );
}

function AnnouncementCard({ announcement, highlighted, isAdmin, deleting, onDelete, setCardRef }) {
  const id = getAnnouncementId(announcement);
  const safeHtml = useMemo(() => sanitizeAnnouncementHtml(announcement.content), [announcement.content]);

  return (
    <article
      className={`announcement-card${highlighted ? ' is-highlighted' : ''}`}
      id={`announcement-${id}`}
      ref={setCardRef(id)}
    >
      <header className="announcement-card__header">
        <div>
          <h2>{announcement.subject}</h2>
          <p>{formatDate(announcement.date)} / {announcement.announcer}</p>
        </div>
        {isAdmin && (
          <button
            className="announcement-card__delete"
            disabled={deleting}
            onClick={() => onDelete(id)}
            type="button"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </header>
      <div
        className="announcement-card__content"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </article>
  );
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const itemRefs = useRef(new Map());

  const [activeTab, setActiveTab] = useState('ask');
  const [announcements, setAnnouncements] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [question, setQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState('');
  const [answer, setAnswer] = useState(null);
  const [postError, setPostError] = useState('');
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [highlightedId, setHighlightedId] = useState('');
  const [postForm, setPostForm] = useState(() => ({
    announcer: user?.name || '',
    date: getTodayValue(),
    content: ''
  }));

  const announcementsById = useMemo(() => {
    const map = new Map();
    announcements.forEach((announcement) => map.set(getAnnouncementId(announcement), announcement));
    return map;
  }, [announcements]);

  const loadAnnouncements = useCallback(async ({ signal, quiet = false } = {}) => {
    if (!quiet) setLoadingList(true);
    setListError('');

    try {
      const payload = await listAnnouncements({ signal });
      setAnnouncements(payload.announcements || []);
    } catch (err) {
      if (err.name !== 'AbortError') setListError(err.message || 'Could not load announcements.');
    } finally {
      if (!quiet) setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAnnouncements({ signal: controller.signal });
    return () => controller.abort();
  }, [loadAnnouncements]);

  useEffect(() => {
    if (!user?.name) return;
    setPostForm((current) => (
      current.announcer ? current : { ...current, announcer: user.name }
    ));
  }, [user?.name]);

  const setCardRef = useCallback((id) => (node) => {
    if (!id) return;
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  }, []);

  const focusAnnouncement = useCallback((id) => {
    if (!id) return;

    setActiveTab('browse');
    setHighlightedId(id);
    window.setTimeout(() => {
      itemRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, []);

  const submitQuestion = async (event) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || askLoading) return;

    setAskLoading(true);
    setAskError('');
    setAnswer(null);

    try {
      const payload = await askAnnouncements({ question: trimmed });
      setAnswer({
        answer: payload.answer || '',
        sources: payload.sources || [],
        contradictions: payload.contradictions || [],
        noMatch: !!payload.noMatch
      });
    } catch (err) {
      setAskError(err.message || 'Could not answer the question.');
    } finally {
      setAskLoading(false);
    }
  };

  const updatePostForm = (field, value) => {
    setPostForm((current) => ({ ...current, [field]: value }));
  };

  const submitPost = async (event) => {
    event.preventDefault();
    if (posting) return;

    setPosting(true);
    setPostError('');

    try {
      await createAnnouncement({
        announcer: postForm.announcer.trim(),
        date: postForm.date,
        content: postForm.content.trim()
      });
      setPostForm((current) => ({ ...current, date: getTodayValue(), content: '' }));
      await loadAnnouncements({ quiet: true });
    } catch (err) {
      setPostError(err.message || 'Could not post announcement.');
    } finally {
      setPosting(false);
    }
  };

  const removeAnnouncement = async (id) => {
    if (!id || deletingId) return;
    if (!window.confirm('Delete this announcement?')) return;

    setDeletingId(id);
    setListError('');

    try {
      await deleteAnnouncement({ id });
      setAnnouncements((current) => current.filter((announcement) => getAnnouncementId(announcement) !== id));
      if (highlightedId === id) setHighlightedId('');
    } catch (err) {
      setListError(err.message || 'Could not delete announcement.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <section className="announcements-page" aria-labelledby="announcements-title">
      <header className="announcements-page__header">
        <h1 id="announcements-title">Announcements</h1>
        <p>Internal knowledge base grounded in admin-posted updates.</p>
      </header>

      <div className="announcements-tabs" role="tablist" aria-label="Announcement views">
        <button
          aria-selected={activeTab === 'ask'}
          className={activeTab === 'ask' ? 'is-active' : ''}
          onClick={() => setActiveTab('ask')}
          role="tab"
          type="button"
        >
          Ask
        </button>
        <button
          aria-selected={activeTab === 'browse'}
          className={activeTab === 'browse' ? 'is-active' : ''}
          onClick={() => setActiveTab('browse')}
          role="tab"
          type="button"
        >
          Browse
        </button>
      </div>

      {activeTab === 'ask' ? (
        <section className="announcements-panel announcements-ask" role="tabpanel">
          <form className="announcements-ask__form" onSubmit={submitQuestion}>
            <label htmlFor="announcement-question">
              <span>Question</span>
              <textarea
                id="announcement-question"
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What is the current policy on..."
                rows="5"
                value={question}
              />
            </label>
            <div className="announcements-actions">
              <button className="announcements-primary-button" disabled={!question.trim() || askLoading} type="submit">
                {askLoading ? 'Asking...' : 'Ask'}
              </button>
            </div>
          </form>

          {askError && <div className="announcements-alert announcements-alert--error">{askError}</div>}

          {answer ? (
            <section className={`announcement-answer${answer.noMatch ? ' is-empty' : ''}`} aria-live="polite">
              <h2>Answer</h2>
              <div className="announcement-answer__body">{answer.answer}</div>

              {answer.sources.length > 0 && (
                <div className="announcement-citations">
                  <h3>Sources</h3>
                  <div>
                    {answer.sources.map((source) => (
                      <SourceChip
                        disabled={!announcementsById.has(source.id)}
                        key={source.id}
                        onClick={focusAnnouncement}
                        source={source}
                      />
                    ))}
                  </div>
                </div>
              )}

              {answer.contradictions.length > 0 && (
                <div className="announcement-contradictions">
                  <h3>Updates Detected</h3>
                  {answer.contradictions.map((item, index) => (
                    <p key={`${item.summary}-${index}`}>{item.summary}</p>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <div className="announcements-empty-state">
              {askLoading ? 'Generating answer...' : 'No answer yet.'}
            </div>
          )}
        </section>
      ) : (
        <section className="announcements-panel announcements-browse" role="tabpanel">
          {isAdmin && (
            <form className="announcement-post-form" onSubmit={submitPost}>
              <div className="announcement-post-form__grid">
                <label htmlFor="announcement-announcer">
                  <span>Announcer</span>
                  <input
                    id="announcement-announcer"
                    onChange={(event) => updatePostForm('announcer', event.target.value)}
                    required
                    value={postForm.announcer}
                  />
                </label>
                <label htmlFor="announcement-date">
                  <span>Date</span>
                  <input
                    id="announcement-date"
                    onChange={(event) => updatePostForm('date', event.target.value)}
                    required
                    type="date"
                    value={postForm.date}
                  />
                </label>
                <label className="announcement-post-form__full" htmlFor="announcement-content">
                  <span>Content</span>
                  <textarea
                    id="announcement-content"
                    onChange={(event) => updatePostForm('content', event.target.value)}
                    required
                    rows="6"
                    value={postForm.content}
                  />
                </label>
              </div>
              {postError && <div className="announcements-alert announcements-alert--error">{postError}</div>}
              <div className="announcements-actions">
                <button
                  className="announcements-primary-button"
                  disabled={posting || !postForm.announcer.trim() || !postForm.date || !postForm.content.trim()}
                  type="submit"
                >
                  {posting ? 'Posting...' : 'Post'}
                </button>
              </div>
            </form>
          )}

          {listError && <div className="announcements-alert announcements-alert--error">{listError}</div>}

          {loadingList ? (
            <div className="announcements-empty-state">Loading announcements...</div>
          ) : announcements.length === 0 ? (
            <div className="announcements-empty-state">No announcements yet.</div>
          ) : (
            <div className="announcements-list">
              {announcements.map((announcement) => {
                const id = getAnnouncementId(announcement);

                return (
                  <AnnouncementCard
                    announcement={announcement}
                    deleting={deletingId === id}
                    highlighted={highlightedId === id}
                    isAdmin={isAdmin}
                    key={id}
                    onDelete={removeAnnouncement}
                    setCardRef={setCardRef}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
