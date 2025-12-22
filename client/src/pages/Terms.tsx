export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-16 space-y-12">
        <header className="space-y-4">
          <h1 className="text-4xl font-bold">Terms of Service</h1>
          <p className="text-muted-foreground">
            Welcome to FamFlix! By using our platform you agree to the following
            terms. Please read them carefully to understand your rights and
            responsibilities while creating and sharing family stories.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Acceptance of Terms</h2>
          <p className="text-muted-foreground">
            By accessing FamFlix, creating an account, or using any of our services,
            you agree to comply with these Terms of Service. If you do not agree,
            please discontinue use of the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">User Accounts</h2>
          <p className="text-muted-foreground">
            You are responsible for maintaining the confidentiality of your account
            credentials and for all activities that occur under your account. Notify
            us immediately of any unauthorized use or security concerns.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Acceptable Use</h2>
          <p className="text-muted-foreground">
            FamFlix is built for positive, family-friendly storytelling. Do not use
            the service to share content that is unlawful, offensive, or violates
            the rights of others. We reserve the right to remove content that
            violates these standards.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Changes to These Terms</h2>
          <p className="text-muted-foreground">
            We may update these Terms from time to time to reflect new features or
            legal requirements. We will notify you of significant changes, and your
            continued use of FamFlix constitutes acceptance of the revised Terms.
          </p>
        </section>
      </div>
    </div>
  );
}
