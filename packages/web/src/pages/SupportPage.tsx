export default function SupportPage() {
  return (
    <div
      className="mx-auto px-4 py-12"
      style={{ maxWidth: 640, color: 'var(--text)', fontFamily: "'Nunito', sans-serif" }}
    >
      <h1 className="rf-heading mb-2" style={{ fontSize: 28, fontWeight: 700 }}>
        Pie Keeper Support
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.7, marginBottom: 28 }}>
        Need a hand with your account, importing a recipe, family sharing, or anything else?
        Email us and include a short description of what happened.
      </p>

      <a
        href="mailto:hello@pompon.com.au?subject=Pie%20Keeper%20support"
        className="rf-btn rf-btn-filled"
        style={{ display: 'inline-flex', textDecoration: 'none' }}
      >
        Email support
      </a>

      <section style={{ marginTop: 36, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
        <h2 className="rf-heading" style={{ fontSize: 18, marginBottom: 8 }}>
          Account and privacy
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.7 }}>
          You can delete your account from <strong>Profile → Delete account</strong> in Pie
          Keeper. This permanently removes the account and its associated recipes, cookbooks,
          meal plans, and notes. You can also read our{' '}
          <a href="/privacy" style={{ color: 'var(--green)' }}>
            privacy policy
          </a>
          .
        </p>
      </section>

      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 36 }}>
        Support is provided from Melbourne, Australia. We aim to reply within two business days.
      </p>
    </div>
  );
}
