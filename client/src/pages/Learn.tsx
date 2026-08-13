/**
 * Learn Page
 *
 * Lists published learning resources with category filter tabs.
 * Fetches categories and articles on mount; clicking a card navigates
 * to the article detail page.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import api from "../services/api";

interface LearningResource {
  id: string;
  title: string;
  slug: string;
  category: string;
  summary: string;
  content: string;
  createdAt: string;
}

interface CategoryCount {
  category: string;
  count: number;
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

export function Learn() {
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [resourcesRes, categoriesRes] = await Promise.all([
          api.get<LearningResource[]>("/learning"),
          api.get<CategoryCount[]>("/learning/categories"),
        ]);
        if (cancelled) return;
        setResources(resourcesRes.data);
        setCategories(categoriesRes.data);
      } catch {
        if (cancelled) return;
        setError("Could not load learning resources. Please try again shortly.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleResources =
    activeCategory === "all"
      ? resources
      : resources.filter((r) => r.category === activeCategory);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Learning Resources</h1>
      <p className="mt-2 text-gray-600">
        Guides and tutorials to help you understand trading before you risk a
        single virtual rupee.
      </p>

      {error && (
        <Alert variant="error" className="mt-6">
          {error}
        </Alert>
      )}

      {!isLoading && !error && resources.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeCategory === "all"
                ? "bg-primary-700 text-white border-primary-700"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => setActiveCategory(c.category)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeCategory === c.category
                  ? "bg-primary-700 text-white border-primary-700"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {categoryLabel(c.category)} ({c.count})
            </button>
          ))}
        </div>
      )}

      <div className="mt-8">
        {isLoading && (
          <Card>
            <div className="text-center py-12 text-gray-500">Loading articles…</div>
          </Card>
        )}

        {!isLoading && !error && resources.length === 0 && (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">No articles published yet.</p>
              <p className="text-sm text-gray-400 mt-1">Check back soon.</p>
            </div>
          </Card>
        )}

        {!isLoading && !error && resources.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleResources.map((resource) => (
              <Link key={resource.id} to={`/learn/${resource.slug}`}>
                <Card className="h-full hover:shadow-md hover:border-primary-200 transition-shadow">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200">
                      {categoryLabel(resource.category)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {estimateReadTime(resource.content)} min read
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-gray-900">
                    {resource.title}
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 line-clamp-3">
                    {resource.summary}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
