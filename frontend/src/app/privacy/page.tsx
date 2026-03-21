import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Ceap Council',
  description: 'Privacy Policy for Ceap Council',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-12">
          <div className="mb-8">
            <Link href="/" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">← Back to Ceap Council</Link>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: March 21, 2026</p>

          <div className="space-y-8 text-sm leading-relaxed text-gray-700">

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Introduction</h2>
              <p>This Privacy Policy explains how Callum Wallace ("we", "us") collects, uses, and protects your personal data when you use Ceap Council at ceapcouncil.com. We are committed to protecting your privacy in accordance with the UK General Data Protection Regulation (UK GDPR).</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Data We Collect</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong className="text-gray-900">Account data:</strong> email address, username, password (stored as a bcrypt hash — never in plain text)</li>
                <li><strong className="text-gray-900">Profile data:</strong> full name, bio, avatar (optional, provided by you)</li>
                <li><strong className="text-gray-900">Usage data:</strong> strategies you create, backtest results, forum posts, comments</li>
                <li><strong className="text-gray-900">Technical data:</strong> IP address (for rate limiting and security), request logs (retained for 30 days)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">3. How We Use Your Data</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>To provide and operate the Service</li>
                <li>To send account verification and password reset emails</li>
                <li>To notify you of activity relevant to your account (mentions, competition results)</li>
                <li>To protect the security and integrity of the platform</li>
              </ul>
              <p className="mt-3">We do not sell your data to third parties. We do not use your data for advertising.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Legal Basis for Processing (UK GDPR)</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-gray-900">Contract:</strong> processing necessary to provide the Service you signed up for</li>
                <li><strong className="text-gray-900">Legitimate interests:</strong> security logging, fraud prevention</li>
                <li><strong className="text-gray-900">Consent:</strong> optional email notifications (you can opt out in dashboard settings)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Data Retention</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Account data is retained while your account is active</li>
                <li>You may request deletion of your account and associated data at any time</li>
                <li>Security logs are retained for 30 days then deleted</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Third Parties</h2>
              <p className="mb-2">We use the following third-party services:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-gray-900">Resend</strong> (resend.com) — email delivery. Your email address is passed to Resend solely to send transactional emails</li>
                <li><strong className="text-gray-900">Hetzner</strong> (hetzner.com) — server hosting in Germany (EU). Your data is stored on EU servers</li>
                <li><strong className="text-gray-900">Cloudflare</strong> (cloudflare.com) — DNS, DDoS protection, and email forwarding</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Your Rights (UK GDPR)</h2>
              <p className="mb-2">You have the right to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-gray-900">Access</strong> the personal data we hold about you</li>
                <li><strong className="text-gray-900">Rectify</strong> inaccurate data</li>
                <li><strong className="text-gray-900">Erasure</strong> ("right to be forgotten") — request deletion of your account and data</li>
                <li><strong className="text-gray-900">Portability</strong> — request a copy of your data in a machine-readable format</li>
                <li><strong className="text-gray-900">Object</strong> to processing based on legitimate interests</li>
              </ul>
              <p className="mt-3">To exercise any of these rights, email us at <a href="mailto:privacy@ceapcouncil.com" className="text-emerald-600 hover:underline">privacy@ceapcouncil.com</a>. We will respond within 30 days.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Security</h2>
              <p className="mb-2">We implement appropriate technical measures to protect your data including:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Encrypted connections (HTTPS/TLS) for all data in transit</li>
                <li>Bcrypt password hashing</li>
                <li>Encrypted 2FA secrets</li>
                <li>Access controls limiting database access</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Cookies</h2>
              <p>We use only essential session cookies required for authentication. We do not use tracking or advertising cookies.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Children</h2>
              <p>The Service is not directed at anyone under 18. We do not knowingly collect data from anyone under 18. If you believe we have collected data from a minor, contact us at <a href="mailto:privacy@ceapcouncil.com" className="text-emerald-600 hover:underline">privacy@ceapcouncil.com</a>.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">11. Changes</h2>
              <p>We may update this Privacy Policy. We will notify users by email of any significant changes.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">12. Contact and Complaints</h2>
              <p className="mb-2">For privacy queries: <a href="mailto:privacy@ceapcouncil.com" className="text-emerald-600 hover:underline">privacy@ceapcouncil.com</a></p>
              <p>You have the right to lodge a complaint with the <strong className="text-gray-900">Information Commissioner&apos;s Office (ICO)</strong> at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">ico.org.uk</a> if you believe we have mishandled your data.</p>
            </section>

          </div>

          <div className="mt-10 pt-8 border-t border-gray-100 flex flex-col sm:flex-row gap-4 text-sm text-gray-500">
            <Link href="/terms" className="text-emerald-600 hover:underline">Terms of Service →</Link>
            <a href="mailto:privacy@ceapcouncil.com" className="hover:text-gray-700">privacy@ceapcouncil.com</a>
          </div>
        </div>
      </div>
    </div>
  );
}
