import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — Ceap Council',
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: March 21, 2026</p>

      <div className="prose prose-gray max-w-none space-y-8 text-gray-700">

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
          <p>By accessing or using Ceap Council ("the Service") at ceapcouncil.com, you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. The Service is operated by Callum Wallace ("we", "us", "our").</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Eligibility</h2>
          <p>You must be at least 18 years old to create an account. By registering, you confirm that you are 18 or older.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Description of Service</h2>
          <p>Ceap Council is an educational platform for backtesting algorithmic trading strategies using historical market data. The Service does not provide financial advice, execute real trades, or manage real money. Nothing on the platform constitutes investment advice.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. User Accounts</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>You are responsible for maintaining the security of your account and password</li>
            <li>You must provide accurate information when registering</li>
            <li>You are responsible for all activity that occurs under your account</li>
            <li>You must notify us immediately of any unauthorised access at <a href="mailto:support@ceapcouncil.com" className="text-emerald-600 hover:text-emerald-700">support@ceapcouncil.com</a></li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Acceptable Use</h2>
          <p className="mb-2">You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use the Service for any unlawful purpose</li>
            <li>Attempt to gain unauthorised access to any part of the Service</li>
            <li>Upload malicious code or interfere with the platform's operation</li>
            <li>Scrape or harvest data from the Service without permission</li>
            <li>Impersonate other users or create multiple accounts to abuse the platform</li>
            <li>Post content that is abusive, hateful, or harassing in community areas</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. User Content</h2>
          <p>You retain ownership of strategy code and content you create. By posting content to community areas (forum, comments), you grant us a non-exclusive licence to display that content on the Service. You are solely responsible for content you post.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Intellectual Property</h2>
          <p>The Ceap Council platform, branding, and underlying code are owned by Callum Wallace. You may not copy, reproduce, or distribute any part of the Service without written permission.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Disclaimers</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>The Service is provided "as is" without warranties of any kind</li>
            <li>Backtest results are historical simulations and do not guarantee future performance</li>
            <li>We do not provide financial advice and are not regulated by the FCA or any financial authority</li>
            <li>We are not responsible for any trading decisions made based on backtest results</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Limitation of Liability</h2>
          <p>To the maximum extent permitted by UK law, Callum Wallace shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Termination</h2>
          <p>We reserve the right to suspend or terminate your account at our discretion if you violate these Terms.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Changes to Terms</h2>
          <p>We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms. We will notify users of significant changes by email.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Governing Law</h2>
          <p>These Terms are governed by the laws of England and Wales.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Contact</h2>
          <p>For any questions regarding these Terms, contact us at <a href="mailto:support@ceapcouncil.com" className="text-emerald-600 hover:text-emerald-700">support@ceapcouncil.com</a>.</p>
        </section>

      </div>

      <div className="mt-12 pt-6 border-t border-gray-200">
        <Link href="/privacy" className="text-emerald-600 hover:text-emerald-700 text-sm">
          View Privacy Policy →
        </Link>
      </div>
    </div>
  );
}
