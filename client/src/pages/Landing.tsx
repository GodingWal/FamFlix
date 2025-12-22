import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Seo, { BASE_URL } from "@/components/Seo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { pressLogos, testimonials, planSpotlight } from "@/data/socialProof";

export default function Landing() {
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "FamFlix AI Family Video Platform",
    description:
      "FamFlix helps families script, narrate, and produce AI-personalized videos with collaborative tools and guided workflows.",
    brand: {
      "@type": "Brand",
      name: "FamFlix",
    },
    audience: {
      "@type": "Audience",
      audienceType: "Families",
    },
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      price: "0.00",
      priceCurrency: "USD",
      url: `${BASE_URL}/`,
    },
  } as const;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How does FamFlix use AI to create family videos?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "FamFlix blends AI voice cloning, smart scripting, and automated editing so families can produce polished keepsake videos without professional tools.",
        },
      },
      {
        "@type": "Question",
        name: "Can multiple family members collaborate in FamFlix?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. FamFlix supports shared projects, allowing family members to review scripts, record narrations, and personalize scenes together in real time.",
        },
      },
    ],
  } as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo
        title="Create AI-powered family videos"
        description="Design cinematic family stories with FamFlix’s AI voice cloning, collaborative editing, and guided storytelling templates."
        canonical={`${BASE_URL}/`}
        openGraph={{
          type: "website",
          url: `${BASE_URL}/`,
          title: "Create AI-powered family videos | FamFlix",
          description:
            "Design cinematic family stories with FamFlix’s AI voice cloning, collaborative editing, and guided storytelling templates.",
        }}
        twitter={{
          title: "Create AI-powered family videos | FamFlix",
          description:
            "Produce AI-personalized keepsakes with FamFlix—voice cloning, smart scripts, and collaborative video editing for every generation.",
        }}
        jsonLd={[productSchema, faqSchema]}
      />
      {/* Navigation Bar */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold gradient-text">FamFlix</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login">
                <Button variant="ghost" data-testid="nav-login">Sign In</Button>
              </Link>
              <Link href="/login">
                <Button data-testid="nav-signup">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-secondary py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center animate-fade-in">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold gradient-text mb-4 sm:mb-6 px-2">
              Create Magical
              <br />
              Family Videos
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-6 sm:mb-8 max-w-3xl mx-auto px-4">
              Transform your family memories with AI-powered voice cloning, collaborative editing, and stunning video creation tools designed for families.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground touch-target" data-testid="hero-get-started">
                  <i className="fas fa-play mr-2"></i>
                  Start Creating Today
                </Button>
              </Link>
              <Button variant="secondary" size="lg" className="w-full sm:w-auto touch-target" data-testid="hero-watch-demo">
                <i className="fas fa-video mr-2"></i>
                Watch Demo
              </Button>
            </div>
          </div>
        </div>
        <div className="absolute top-20 right-10 w-32 h-32 bg-primary/20 rounded-full blur-xl animate-float hidden sm:block"></div>
        <div className="absolute bottom-20 left-10 w-24 h-24 bg-accent/20 rounded-full blur-xl animate-float hidden sm:block" style={{ animationDelay: '1s' }}></div>
      </section>

      {/* Press Logos */}
      <section className="py-12 border-y border-border bg-card/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs sm:text-sm uppercase tracking-[0.3em] text-muted-foreground mb-8">
            Celebrated by families and the press
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-10 text-center">
            {pressLogos.map((logo) => (
              <div
                key={logo.name}
                className="space-y-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <p className="font-semibold text-foreground text-sm sm:text-base">{logo.name}</p>
                <p className="text-xs sm:text-sm opacity-80">{logo.tagline}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 sm:py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4 px-2">Powerful Features for Every Family</h3>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
              Everything you need to create professional-quality family videos with the power of AI
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            <Card className="glass-effect hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-microphone text-primary text-2xl"></i>
                </div>
                <h4 className="text-lg sm:text-xl font-semibold mb-2">AI Voice Cloning</h4>
                <p className="text-sm sm:text-base text-muted-foreground">Clone family voices with just a few audio samples and bring stories to life</p>
              </CardContent>
            </Card>

            <Card className="glass-effect hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-users text-accent text-2xl"></i>
                </div>
                <h4 className="text-lg sm:text-xl font-semibold mb-2">Real-time Collaboration</h4>
                <p className="text-sm sm:text-base text-muted-foreground">Work together as a family to create videos in real-time from anywhere</p>
              </CardContent>
            </Card>

            <Card className="glass-effect hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-robot text-primary text-2xl"></i>
                </div>
                <h4 className="text-lg sm:text-xl font-semibold mb-2">AI Script Generation</h4>
                <p className="text-sm sm:text-base text-muted-foreground">Generate engaging family stories and scripts using advanced AI technology</p>
              </CardContent>
            </Card>

            <Card className="glass-effect hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-video text-accent text-2xl"></i>
                </div>
                <h4 className="text-lg sm:text-xl font-semibold mb-2">Professional Templates</h4>
                <p className="text-sm sm:text-base text-muted-foreground">Choose from curated video templates designed specifically for family stories</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h3 className="text-3xl md:text-4xl font-bold mb-4">Families Are Sharing the Love</h3>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Real stories from families who transformed everyday moments into unforgettable films
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial) => {
              const initials = testimonial.name
                .split(" ")
                .map((part: string) => part.charAt(0))
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase();

              return (
                <Card key={testimonial.name} className="glass-effect h-full">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex-1">
                      <i className="fas fa-quote-left text-primary text-2xl"></i>
                      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                        “{testimonial.quote}”
                      </p>
                    </div>
                    <div className="mt-6 pt-6 border-t border-border flex items-center gap-4">
                      <Avatar className="h-12 w-12 bg-primary/10 text-primary">
                        <AvatarFallback className="text-base font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left">
                        <p className="font-semibold">{testimonial.name}</p>
                        <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h3 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h3>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Create stunning family videos in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-foreground">1</span>
              </div>
              <h4 className="text-xl font-semibold mb-4">Record & Upload</h4>
              <p className="text-muted-foreground">
                Record voice samples to create AI voice profiles for your family members
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-foreground">2</span>
              </div>
              <h4 className="text-xl font-semibold mb-4">Choose & Customize</h4>
              <p className="text-muted-foreground">
                Select from professional video templates and let AI generate engaging scripts tailored to your family
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-foreground">3</span>
              </div>
              <h4 className="text-xl font-semibold mb-4">Create & Share</h4>
              <p className="text-muted-foreground">
                Collaborate with family members to edit and perfect your video, then share your masterpiece
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gradient-to-r from-primary/10 to-accent/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-3xl md:text-4xl font-bold mb-6">Why Families Love FamFlix</h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <i className="fas fa-heart text-primary text-sm"></i>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Preserve Family Memories</h4>
                    <p className="text-muted-foreground">Create lasting memories that can be shared across generations with authentic family voices</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <i className="fas fa-clock text-primary text-sm"></i>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Save Time & Effort</h4>
                    <p className="text-muted-foreground">AI-powered tools handle the heavy lifting, so you can focus on the creative storytelling</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <i className="fas fa-shield-alt text-primary text-sm"></i>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Safe & Private</h4>
                    <p className="text-muted-foreground">Your family data is protected with enterprise-grade security and privacy controls</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <i className="fas fa-mobile-alt text-primary text-sm"></i>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Works Anywhere</h4>
                    <p className="text-muted-foreground">Access from any device, collaborate remotely, and create together wherever you are</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <div className="bg-card rounded-2xl p-8 shadow-lg">
                <div className="w-24 h-24 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mx-auto mb-6">
                  <i className="fas fa-magic text-white text-3xl"></i>
                </div>
                <h4 className="text-2xl font-bold mb-4">Crafted for Modern Families</h4>
                <p className="text-muted-foreground">
                  From daily updates to milestone documentaries, FamFlix combines secure sharing with joyful
                  storytelling tools that every generation can enjoy.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8 text-left">
                  <div className="bg-primary/5 rounded-xl p-4">
                    <p className="text-3xl font-bold text-primary">98%</p>
                    <p className="text-sm text-muted-foreground">of families say collaboration feels effortless</p>
                  </div>
                  <div className="bg-accent/5 rounded-xl p-4">
                    <p className="text-3xl font-bold text-accent">24 hrs</p>
                    <p className="text-sm text-muted-foreground">average time saved every month on editing</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Plans Teaser */}
      <section className="py-20 bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-bold mb-4">Plans at a Glance</h3>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Flexible options that grow with your family’s storytelling ambitions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {planSpotlight.map((plan) => (
              <Card
                key={plan.name}
                className={`relative h-full border ${plan.featured ? "border-primary shadow-lg" : "border-border"}`}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold tracking-wide px-3 py-1 rounded-full shadow">
                    Most Loved
                  </span>
                )}
                <CardContent className="p-6 text-center flex flex-col h-full">
                  <div className="mb-4">
                    <h4 className="text-2xl font-semibold mb-2">{plan.name}</h4>
                    <p className="text-3xl font-bold text-primary">{plan.price}</p>
                  </div>
                  <p className="text-muted-foreground flex-1">{plan.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-card rounded-2xl p-10 shadow-xl text-center">
            <h4 className="text-3xl font-bold mb-4">Ready to Get Started?</h4>
            <p className="text-lg text-muted-foreground mb-8">
              Join thousands of families already creating magical memories with FamFlix.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="cta-signup">
                  <i className="fas fa-rocket mr-2"></i>
                  Create Your First Video
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="secondary" size="lg">
                  <i className="fas fa-comments mr-2"></i>
                  Talk with Us
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold gradient-text mb-4">FamFlix</h1>
            <p className="text-muted-foreground mb-6">Creating magical family memories with AI</p>
            <div className="flex justify-center space-x-6">
              <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
                Get Started
              </Link>
              <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
