import { useState } from 'react';
import { LifeBuoy, Trash2, X } from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { logAdminAction } from '../../services/adminAuditLog';
import {
  createHelpArticle,
  deleteHelpArticle,
  updateHelpArticle,
  HELP_CATEGORIES,
  type HelpArticle,
  type HelpArticleCategory,
} from '../../services/adminHelpArticles';

interface AdminHelpArticleModalProps {
  /** Omit to create a new article; pass an existing one to edit it. */
  article: HelpArticle | null;
  adminUid: string;
  adminEmail: string;
  onClose: () => void;
  onSaved: (article: HelpArticle) => void;
  onDeleted: (id: string) => void;
}

export function AdminHelpArticleModal({
  article,
  adminUid,
  adminEmail,
  onClose,
  onSaved,
  onDeleted,
}: AdminHelpArticleModalProps) {
  useEscapeToClose(onClose);
  const isEdit = article !== null;

  const [title, setTitle] = useState(article?.title ?? '');
  const [category, setCategory] = useState<HelpArticleCategory>(article?.category ?? 'general');
  const [body, setBody] = useState(article?.body ?? '');
  const [published, setPublished] = useState(article?.published ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canSave = title.trim().length >= 3 && body.trim().length >= 10;

  const log = (
    action: Parameters<typeof logAdminAction>[0]['action'],
    detail: string,
    targetId: string,
  ) =>
    void logAdminAction({
      adminUid,
      adminEmail,
      action,
      targetType: 'help-article',
      targetId,
      targetLabel: title.trim() || targetId,
      detail,
    });

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        const publishedChanged = published !== article.published;
        await updateHelpArticle(article.id, { title, category, body, published }, adminEmail);
        log('help-article.updated', `Edited "${title.trim()}"`, article.id);
        if (publishedChanged) {
          log(
            published ? 'help-article.published' : 'help-article.unpublished',
            title.trim(),
            article.id,
          );
        }
        onSaved({ ...article, title: title.trim(), category, body: body.trim(), published, updatedAt: new Date().toISOString(), updatedBy: adminEmail });
      } else {
        const created = await createHelpArticle({ title, category, body, published }, adminEmail);
        log('help-article.created', `Created "${created.title}"`, created.id);
        onSaved(created);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this article');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!article) return;
    setSaving(true);
    setError(null);
    try {
      await deleteHelpArticle(article.id);
      log('help-article.deleted', title.trim() || article.id, article.id);
      onDeleted(article.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this article');
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-article-modal-title"
        onClick={onClose}
      >
        <div
          className="glass-card rounded-xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-2">
              <LifeBuoy size={18} className="text-emerald-400" />
              <h3 id="help-article-modal-title" className="text-lg font-semibold">
                {isEdit ? 'Edit article' : 'New article'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-text-secondary hover:text-text-primary"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-text-secondary mb-1.5 block" htmlFor="help-article-title">
                Title
              </label>
              <input
                id="help-article-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. How broker sync works"
                className="input-field text-sm w-full"
              />
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1.5 block" htmlFor="help-article-category">
                Category
              </label>
              <select
                id="help-article-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as HelpArticleCategory)}
                className="input-field text-sm w-full"
              >
                {HELP_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1.5 block" htmlFor="help-article-body">
                Article body
              </label>
              <textarea
                id="help-article-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder="Write the article. Leave a blank line between paragraphs."
                className="input-field text-sm w-full resize-y min-h-[200px] font-normal leading-relaxed"
              />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="h-4 w-4 rounded border-border/60 accent-emerald-500"
              />
              <span className="text-sm text-text-primary">Published (visible on the public Help Center)</span>
            </label>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={!canSave || saving}
                onClick={() => void save()}
                className="btn-primary text-sm px-5 py-2.5 disabled:opacity-50"
              >
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create article'}
              </button>
              {isEdit && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmDelete(true)}
                  className="ml-auto inline-flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this article?"
          message={`Remove "${title.trim() || 'this article'}" from the Help Center? This can't be undone.`}
          confirmLabel="Delete article"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void remove();
          }}
        />
      )}
    </>
  );
}
