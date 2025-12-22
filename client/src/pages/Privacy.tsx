import { Link } from "wouter";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-16 space-y-12">
        <header className="space-y-4">
          <h1 className="text-4xl font-bold">Privacy Policy</h1>
          <p className="text-muted-foreground">
            At FamFlix, we care deeply about protecting your family's memories. This
            Privacy Policy explains what information we collect, how we use it, and
            the choices you have to manage your data.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Information We Collect</h2>
          <p className="text-muted-foreground">
            We collect information you provide directly when creating an account,
            uploading media, or interacting with FamFlix features. This can include
            names, email addresses, voice samples, photos, and any stories you
            choose to share on the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">How We Use Your Information</h2>
          <p className="text-muted-foreground">
            Your data powers the FamFlix experience. We use it to personalize your
            projects, provide collaborative features, improve our AI tools, and keep
            you informed about updates. We never sell your data and only share it
            with trusted providers that help us deliver FamFlix services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Your Rights & Choices</h2>
          <p className="text-muted-foreground">
            You can access, update, or delete your personal information at any time
            from your account settings. If you have questions or would like to make
            a request, please reach out to us. We are committed to keeping your
            family's memories safe and secure.
          </p>
        </section>

        <footer className="pt-8 border-t border-border">
          <p className="text-muted-foreground">
            Have questions? <Link href="/contact" className="text-primary hover:underline">Contact us</Link> and we'll be happy
            to help.
          </p>
        </footer>
      </div>
    </div>
  );
}
