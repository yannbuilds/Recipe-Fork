export default function PrivacyPolicy() {
  return (
    <div
      className="mx-auto px-4 py-12"
      style={{ maxWidth: 640, color: 'var(--text)', fontFamily: "'Nunito', sans-serif" }}
    >
      <h1
        className="rf-heading mb-2"
        style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}
      >
        Privacy Policy
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32 }}>
        Last updated: 21 March 2026
      </p>

      <Section title="What Pie Keeper does">
        <p>
          Pie Keeper is a Chrome extension and companion web app that helps you save
          recipes from any website. When you click "Save Recipe", the extension reads
          the current page's HTML and sends it to an AI service to extract structured
          recipe data (title, ingredients, steps, etc.). That data is then stored in
          your personal recipe library.
        </p>
      </Section>

      <Section title="Data we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Account information</strong> – email address and password (or
            OAuth profile) used to create your account.
          </li>
          <li>
            <strong>Recipe page content</strong> – when you click "Save Recipe", the
            HTML of the current page is sent to our AI parsing service. We do not
            store the raw HTML after parsing is complete.
          </li>
          <li>
            <strong>Saved recipe data</strong> – the structured recipe (title,
            ingredients, steps, image URL, source URL, tags) is stored in our
            database linked to your account.
          </li>
        </ul>
      </Section>

      <Section title="Third-party services">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Groq API</strong> – processes page HTML to extract recipe data.
            Content is sent via their API and is subject to{' '}
            <a
              href="https://groq.com/privacy-policy/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--green)' }}
            >
              Groq's privacy policy
            </a>
            .
          </li>
          <li>
            <strong>Supabase</strong> – hosts our database and authentication
            service. Subject to{' '}
            <a
              href="https://supabase.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--green)' }}
            >
              Supabase's privacy policy
            </a>
            .
          </li>
        </ul>
      </Section>

      <Section title="How we use your data">
        <p>
          Your data is used solely to provide the Pie Keeper service – saving,
          organising, and displaying your recipes. We do not sell, share, or use your
          data for advertising purposes.
        </p>
      </Section>

      <Section title="Data storage and security">
        <p>
          Recipe data and account credentials are stored securely in Supabase
          (hosted on AWS). Authentication tokens are stored locally in your
          browser's extension storage. All data is transmitted over HTTPS.
        </p>
      </Section>

      <Section title="Your rights">
        <ul className="list-disc pl-5 space-y-1">
          <li>You can delete any saved recipe from within the app at any time.</li>
          <li>
            You can delete your account and all associated data by contacting us.
          </li>
          <li>You can sign out of the extension at any time to revoke access.</li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          If you have questions about this privacy policy, reach out via the
          project's GitHub repository or email the developer directly.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        className="rf-heading"
        style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text)' }}>
        {children}
      </div>
    </section>
  );
}
