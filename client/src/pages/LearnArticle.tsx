/**
 * Learn Article Page
 *
 * Fetches a single learning resource by slug and renders its Markdown
 * content. Shows category, title, and estimated reading time.
 */

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";

import api from "../services/api";

/**
 * Custom element renderers for react-markdown. The project has no
 * Tailwind typography plugin, so headings/lists/tables/links are
 * styled explicitly here instead of relying on a `prose` class.
 */
const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold text-gray-900 mt-8 mb-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold text-gray-900 mt-7 mb-3 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">{children}</h3>
  ),
  p: ({ children }) => <p className="text-gray-700 leading-relaxed mb-4">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-5 mb-4 space-y-1 text-gray-700">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-5 mb-4 space-y-1 text-gray-700">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <Link to={href?.startsWith("/") ? href : `/learn/${href}`} className="text-primary-700 hover:text-primary-800 font-medium underline">
      {children}
    </Link>
  ),
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  code: ({ children }) => (
    <code className="bg-gray-100 text-gray-800 rounded px-1.5 py-0.5 text-sm font-mono">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="bg-gray-100 text-gray-800 rounded-md p-4 mb-4 overflow-x-auto text-sm font-mono">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full border border-gray-200 text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-900">{children}</th>
  ),
  td: ({ children }) => <td className="border border-gray-200 px-3 py-2 text-gray-700">{children}</td>,
  hr: () => <hr className="my-6 border-gray-200" />,
};

interface LearningResource {
  id: string;
  title: string;
  slug: string;
  category: string;
  content: string;
  summary: string;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  basics: "Basics",
  charts: "Charts",
  strategy: "Strategy",
  glossary: "Glossary",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

const WORDS_PER_MINUTE = 200;

function estimateReadTime(content: string): number {
  const wordCount = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

export function LearnArticle() {
  const { slug } = useParams<{ slug: string }>();
  const [resource, setResource] = useState<LearningResource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await api.get<LearningResource>(`/learning/${slug}`);
        if (cancelled) return;
        setResource(data);
      } catch {
        if (cancelled) return;
        setError("This article could not be found.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link
        to="/learn"
        className="text-sm font-medium text-primary-700 hover:text-primary-800 inline-flex items-center gap-1"
      >
        ← Back to Learning Resources
      </Link>

      <div className="mt-6">
        {isLoading && (
          <Card>
            <div className="text-center py-12 text-gray-500">Loading article…</div>
          </Card>
        )}

        {!isLoading && error && (
          <Alert variant="error" className="mt-2">
            {error}
          </Alert>
        )}

        {!isLoading && !error && resource && (
          <article>
            <div className="flex items-center gap-3">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200">
                {categoryLabel(resource.category)}
              </span>
              <span className="text-xs text-gray-400">
                {estimateReadTime(resource.content)} min read
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-bold text-gray-900">
              {resource.title}
            </h1>

            <Card className="mt-8">
              <div className="max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {resource.content}
                </ReactMarkdown>
              </div>
            </Card>
          </article>
        )}
      </div>
    </div>
  );
}
