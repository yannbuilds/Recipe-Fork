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
        Last updated: 16 July 2026
      </p>

      <Section title="What Pie Keeper does">
        <p>
          Pie Keeper is an iOS, Android, web, and Chrome extension recipe manager. It
          lets you save recipes from the web, organise them into cookbooks, plan meals,
          keep cooking notes, and optionally share a collection with a family member.
        </p>
      </Section>

      <Section title="Data we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Account information</strong> – your email address, display name,
            and authentication identifier. Password handling is provided by Supabase;
            Pie Keeper does not have access to your plain-text password.
          </li>
          <li>
            <strong>Recipe page content</strong> – when you click "Save Recipe", the
            HTML of the current page is sent to our AI parsing service. We do not
            store the raw HTML after parsing is complete.
          </li>
          <li>
            <strong>Recipe photos</strong> – photos you choose or take for recipe
            scanning are uploaded to a private, account-scoped area and sent to our AI
            parsing service. Scan uploads are deleted after processing. If you choose a
            dish photo suitable for the recipe cover, that image may be retained with
            the saved recipe.
          </li>
          <li>
            <strong>Saved content</strong> – recipes, ingredients, cooking steps,
            source and image URLs, tags, notes, cookbooks, meal plans, shopping-list
            state, preferences, and family-sharing choices are stored against your account.
          </li>
        </ul>
      </Section>

      <Section title="Third-party services">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Groq API</strong> – processes recipe page content or recipe photos
            to extract structured recipe data. Content is sent via their API and is subject to{' '}
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
          Your data is used solely to provide, secure, and support Pie Keeper – including
          saving, organising, importing, syncing, sharing, and displaying your recipes.
          We do not sell your data, use it for targeted advertising, or track you across
          other companies' apps or websites.
        </p>
      </Section>

      <Section title="Data storage and security">
        <p>
          Recipe data and account credentials are stored securely in Supabase
          (hosted on AWS). Authentication tokens and a limited offline recipe cache are
          stored locally on your device or browser. The offline cache is cleared when
          you sign out of the mobile app. All data is transmitted over HTTPS.
        </p>
      </Section>

      <Section title="Your rights">
        <ul className="list-disc pl-5 space-y-1">
          <li>You can delete any saved recipe from within the app at any time.</li>
          <li>You can delete your account and associated data in Profile → Delete account.</li>
          <li>You can sign out of the extension at any time to revoke access.</li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          If you have questions or a privacy request, email{' '}
          <a href="mailto:hello@pompon.com.au" style={{ color: 'var(--green)' }}>
            hello@pompon.com.au
          </a>{' '}
          or visit our <a href="/support" style={{ color: 'var(--green)' }}>support page</a>.
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
