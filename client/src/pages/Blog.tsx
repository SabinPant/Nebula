/**
 * Blog Page (Placeholder)
 *
 * Coming soon. Link exists in the navbar for future content.
 */

import { Card } from "../components/ui/Card";

export function Blog() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Blog</h1>
      <Card className="mt-8">
        <div className="text-center py-12">
          <p className="text-gray-500">Coming soon.</p>
          <p className="text-sm text-gray-400 mt-1">
            Trading guides, market insights, and platform updates — stay tuned.
          </p>
        </div>
      </Card>
    </div>
  );
}
