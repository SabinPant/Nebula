/**
 * Admin Learning Content Management Page
 *
 * Page-based paginated table of every learning resource (published and
 * unpublished), with a create/edit modal and delete confirmation.
 * Desktop table + mobile cards pattern (mirrors Users.tsx/TopUps.tsx).
 */

import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

interface LearningResource {
  id: string;
  title: string;
  slug: string;
  category: string;
  tier: "FREE" | "PREMIUM";
  content: string;
  summary: string;
  isPublished: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
}

const RESOURCES_PER_PAGE = 20;

const textareaClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono";

const selectClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface FormState {
  title: string;
  slug: string;
  category: string;
  tier: "FREE" | "PREMIUM";
  summary: string;
  content: string;
  isPublished: boolean;
  order: string;
}

const emptyForm: FormState = {
  title: "",
  slug: "",
  category: "",
  tier: "FREE",
  summary: "",
  content: "",
  isPublished: false,
  order: "0",
};

export function AdminLearning() {
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");

  const [categories, setCategories] = useState<string[]>([]);

  // Create/Edit modal state
  const [editTarget, setEditTarget] = useState<LearningResource | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<LearningResource | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const modalOpen = isCreating || editTarget !== null;

  useEffect(() => {
    fetchResources(1);
    fetchCategories();
  }, []);

  async function fetchResources(page: number) {
    if (page === 1) setLoading(true);
    else setLoadingPage(true);
    setError("");

    try {
      const { data } = await api.get(
        `/admin/learning?page=${page}&limit=${RESOURCES_PER_PAGE}`,
      );
      setResources(data.data);
      setPagination(data.pagination);
    } catch {
      setError("Failed to load learning resources.");
    } finally {
      setLoading(false);
      setLoadingPage(false);
    }
  }

  async function fetchCategories() {
    try {
      const { data } = await api.get("/learning/categories");
      setCategories(data.map((c: { category: string }) => c.category));
    } catch {
      // Category list is a convenience for the dropdown — a failed fetch
      // just leaves it empty; admins can still type a category by hand.
    }
  }

  function openCreateModal() {
    setForm(emptyForm);
    setSlugTouched(false);
    setFormError("");
    setIsCreating(true);
  }

  function openEditModal(resource: LearningResource) {
    setForm({
      title: resource.title,
      slug: resource.slug,
      category: resource.category,
      tier: resource.tier,
      summary: resource.summary,
      content: resource.content,
      isPublished: resource.isPublished,
      order: String(resource.order),
    });
    setSlugTouched(true);
    setFormError("");
    setEditTarget(resource);
  }

  const closeModal = useCallback(() => {
    setIsCreating(false);
    setEditTarget(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setFormError("");
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, closeModal]);

  function handleTitleChange(value: string) {
    setForm((f) => ({
      ...f,
      title: value,
      slug: slugTouched ? f.slug : slugify(value),
    }));
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setForm((f) => ({ ...f, slug: value }));
  }

  async function handleSubmit() {
    setFormError("");

    const orderNum = parseInt(form.order, 10);
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      category: form.category.trim(),
      tier: form.tier,
      summary: form.summary.trim(),
      content: form.content,
      isPublished: form.isPublished,
      order: isNaN(orderNum) ? 0 : orderNum,
    };

    if (!payload.title) return setFormError("Title is required.");
    if (!payload.slug) return setFormError("Slug is required.");
    if (!payload.category) return setFormError("Category is required.");
    if (!payload.summary) return setFormError("Summary is required.");
    if (!payload.content) return setFormError("Content is required.");

    setSubmitting(true);

    try {
      if (editTarget) {
        await api.patch(`/admin/learning/${editTarget.id}`, payload);
      } else {
        await api.post("/admin/learning", payload);
      }
      closeModal();
      fetchResources(pagination?.page ?? 1);
      fetchCategories();
    } catch (err: any) {
      const message =
        err.response?.data?.message || "Failed to save learning resource.";
      setFormError(Array.isArray(message) ? message[0] : message);
    } finally {
      setSubmitting(false);
    }
  }

  function openDeleteModal(resource: LearningResource) {
    setDeleteTarget(resource);
    setDeleteError("");
  }

  const closeDeleteModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError("");
  }, []);

  useEffect(() => {
    if (!deleteTarget) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeDeleteModal();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteTarget, closeDeleteModal]);

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError("");

    try {
      await api.delete(`/admin/learning/${deleteTarget.id}`);
      closeDeleteModal();
      const isLastRowOnPage =
        resources.length === 1 && (pagination?.page ?? 1) > 1;
      fetchResources(isLastRowOnPage ? (pagination!.page - 1) : (pagination?.page ?? 1));
    } catch {
      setDeleteError("Failed to delete learning resource.");
    } finally {
      setDeleting(false);
    }
  }

  const canSubmit =
    form.title.trim().length > 0 &&
    form.slug.trim().length > 0 &&
    form.category.trim().length > 0 &&
    form.summary.trim().length > 0 &&
    form.content.trim().length > 0 &&
    !submitting;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Learning Resources
          </h1>
          {pagination && (
            <p className="text-sm text-gray-400">
              {pagination.totalCount} resource
              {pagination.totalCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Button variant="primary" onClick={openCreateModal}>
          New Article
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      ) : resources.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500">No learning resources yet.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Title
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Category
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Tier
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Status
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Order
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {r.title}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">
                            {r.slug}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {r.category}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {r.tier}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                              r.isPublished
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {r.isPublished ? "Published" : "Unpublished"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {r.order}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openEditModal(r)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => openDeleteModal(r)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {resources.map((r) => (
              <Card key={r.id}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{r.title}</p>
                      <p className="text-xs text-gray-400 font-mono">
                        {r.slug}
                      </p>
                    </div>
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                        r.isPublished
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {r.isPublished ? "Published" : "Unpublished"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500">Category</p>
                      <p className="text-gray-900 font-medium">
                        {r.category}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Tier</p>
                      <p className="text-gray-900 font-medium">{r.tier}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Order</p>
                      <p className="text-gray-900 font-medium">{r.order}</p>
                    </div>
                  </div>
                  <div className="pt-1 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => openEditModal(r)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="w-full"
                      onClick={() => openDeleteModal(r)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchResources(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loadingPage}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchResources(pagination.page + 1)}
                  disabled={
                    pagination.page >= pagination.totalPages || loadingPage
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4 py-8 overflow-y-auto"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="w-full max-w-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={isCreating ? "New Article" : `Edit ${editTarget?.title}`}
          >
            <Card title={isCreating ? "New Article" : `Edit — ${editTarget?.title}`}>
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Title"
                    value={form.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    required
                  />
                  <Input
                    label="Slug"
                    value={form.slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="auto-generated-from-title"
                    required
                  />
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <input
                      list="learning-categories"
                      value={form.category}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, category: e.target.value }))
                      }
                      className={selectClass}
                      placeholder="e.g. basics"
                      required
                    />
                    <datalist id="learning-categories">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tier
                    </label>
                    <select
                      value={form.tier}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          tier: e.target.value as "FREE" | "PREMIUM",
                        }))
                      }
                      className={selectClass}
                    >
                      <option value="FREE">FREE</option>
                      <option value="PREMIUM">PREMIUM</option>
                    </select>
                  </div>

                  <Input
                    label="Order"
                    type="number"
                    value={form.order}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, order: e.target.value }))
                    }
                  />
                </div>

                <Input
                  label="Summary"
                  value={form.summary}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, summary: e.target.value }))
                  }
                  placeholder="Short description shown on the listing card"
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Content (Markdown)
                  </label>
                  <textarea
                    value={form.content}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, content: e.target.value }))
                    }
                    rows={12}
                    className={textareaClass}
                    required
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isPublished}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isPublished: e.target.checked }))
                    }
                    className="rounded border-gray-300 text-primary-700 focus:ring-primary-500"
                  />
                  Published
                </label>

                {formError && <Alert variant="error">{formError}</Alert>}

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={closeModal}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                  >
                    {submitting
                      ? "Saving..."
                      : isCreating
                        ? "Create Article"
                        : "Save Changes"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
          onClick={closeDeleteModal}
          role="presentation"
        >
          <div
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${deleteTarget.title}`}
          >
            <Card title={`Delete "${deleteTarget.title}"?`}>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  This will permanently delete this learning resource. This
                  action cannot be undone.
                </p>

                {deleteError && <Alert variant="error">{deleteError}</Alert>}

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={closeDeleteModal}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDeleteConfirm}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting..." : "Confirm Delete"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
