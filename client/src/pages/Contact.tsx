/**
 * Contact Page
 *
 * Public contact information and support details.
 */
import { Card } from "../components/ui/Card";

export function Contact() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Contact Us</h1>
      <p className="mt-4 text-lg text-gray-500 leading-relaxed">
        Have questions, feedback, or need help? We're here for you.
      </p>

      <div className="mt-12 grid sm:grid-cols-3 gap-6">
        <Card>
          <h2 className="font-semibold text-gray-900">Email</h2>
          <p className="mt-2 text-sm text-gray-500">
            Reach out anytime at{" "}
            <a
              href="mailto:support@nebula.com"
              className="text-primary-600 hover:text-primary-700"
            >
              support@nebula.com
            </a>
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold text-gray-900">GitHub</h2>
          <p className="mt-2 text-sm text-gray-500">
            This project is open source. Report issues or contribute on{" "}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700"
            >
              GitHub
            </a>
            .
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold text-gray-900">Response Time</h2>
          <p className="mt-2 text-sm text-gray-500">
            We typically respond within 24-48 hours during business days.
          </p>
        </Card>
      </div>

      <div className="mt-12 p-8 bg-surface-50 border border-gray-200 rounded-xl text-center">
        <p className="text-sm text-gray-500">
          Nebula is a BSc Computer Science Final Year Project. Built for
          education, not commercial use.
        </p>
      </div>
    </div>
  );
}
