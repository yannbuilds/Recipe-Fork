import { useEffect, useState } from "react";
const APP_URL = import.meta.env.VITE_APP_URL || "https://app.piekeeper.com";
import { Scissors, Search, CalendarDays, Chrome, Sparkles, Tag, ListChecks, ChefHat, ShoppingCart, LayoutGrid, ChevronDown } from "lucide-react";

/* ── Scroll-reveal hook ──────────────────────── */
function useReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll(".lp-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/* ── Landing nav ─────────────────────────────── */
function LandingNav() {
  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        className="mx-auto flex items-center justify-between"
        style={{ maxWidth: 1100, padding: "14px 24px" }}
      >
        <span className="rf-heading text-xl font-bold" style={{ color: "var(--text)" }}>
          Pie Keeper
        </span>
        <div className="flex items-center gap-3">
          <a href={`${APP_URL}/login`} className="rf-btn rf-btn-primary" style={{ padding: "8px 16px", fontSize: 13 }}>
            Sign in
          </a>
          <a href={`${APP_URL}/login?signup=true`} className="rf-btn rf-btn-filled" style={{ padding: "8px 16px", fontSize: 13 }}>
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ── Floating badge (decorative) ─────────────── */
function FloatingBadge({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rf-card pointer-events-none hidden md:flex items-center gap-2 ${className}`}
      style={{
        position: "absolute",
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: "nowrap",
        zIndex: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── Feature pill ────────────────────────────── */
function FeaturePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="lp-chip">
      {icon}
      {label}
    </span>
  );
}

/* ── Phone mockup ────────────────────────────── */
function PhoneMockup({
  src,
  alt,
  className = "",
  style = {},
}: {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`lp-phone ${className}`} style={{ width: 260, overflow: "hidden", ...style }}>
      <img src={src} alt={alt} />
    </div>
  );
}

/* ── Feature row ─────────────────────────────── */
function FeatureRow({
  title,
  description,
  pills,
  screenshot,
  screenshotAlt,
  reverse = false,
}: {
  title: string;
  description: string;
  pills: { icon: React.ReactNode; label: string }[];
  screenshot: string;
  screenshotAlt: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={`lp-reveal flex flex-col items-center gap-10 ${
        reverse ? "md:flex-row-reverse" : "md:flex-row"
      }`}
      style={{ transitionDelay: "0.1s" }}
    >
      <div className="flex-1 flex justify-center">
        <PhoneMockup src={screenshot} alt={screenshotAlt} className="lp-float-slow" />
      </div>
      <div className="flex-1" style={{ maxWidth: 460 }}>
        <h3 className="rf-heading text-2xl font-bold mb-3" style={{ color: "var(--text)" }}>
          {title}
        </h3>
        <p style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>
          {description}
        </p>
        <div className="flex flex-wrap gap-2">
          {pills.map((p) => (
            <FeaturePill key={p.label} icon={p.icon} label={p.label} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Accordion item ─────────────────────────── */
function AccordionItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rf-card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left"
        style={{
          padding: "20px 24px",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        <span
          className="rf-heading font-semibold"
          style={{ fontSize: 16, color: "var(--text)", paddingRight: 16 }}
        >
          {question}
        </span>
        <ChevronDown
          size={20}
          className={`lp-accordion-chevron ${isOpen ? "open" : ""}`}
          style={{ color: "var(--green)" }}
        />
      </button>
      <div className={`lp-accordion-body ${isOpen ? "open" : ""}`}>
        <div>
          <p
            style={{
              padding: "0 24px 20px",
              color: "var(--muted)",
              fontSize: 15,
              lineHeight: 1.7,
            }}
          >
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Main landing page ───────────────────────── */
export default function LandingPage() {
  useReveal();

  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const howToItems = [
    {
      question: "How do I install the Chrome extension?",
      answer:
        "Visit the Chrome Web Store and search for Pie Keeper, or click the link in your dashboard after signing up. Click 'Add to Chrome', then pin the extension to your toolbar for easy access. The extension icon will appear next to your address bar.",
    },
    {
      question: "How do I save a recipe from a website?",
      answer:
        "Navigate to any recipe page and click the Pie Keeper extension icon in your toolbar. The extension uses AI to read the page and extract the recipe title, ingredients, steps, and photo. Review the details, add any tags you like, and hit Save. The recipe appears in your collection instantly.",
    },
    {
      question: "Can I add a recipe manually?",
      answer:
        "Yes! Open your Pie Keeper collection and tap the + button. You can paste in a URL to import a recipe, or type in a title, ingredients, and steps by hand. This is handy for family recipes, handwritten cards, or anything not published online.",
    },
    {
      question: "How do I add Pie Keeper to my phone's home screen?",
      answer:
        "Pie Keeper is a web app that works like a native app on your phone. On iPhone, open Pie Keeper in Safari, tap the Share button, and choose 'Add to Home Screen'. On Android, open it in Chrome, tap the three-dot menu, and select 'Add to Home screen'. You'll get a full-screen app experience with no browser bar.",
    },
    {
      question: "How does the weekly meal planner work?",
      answer:
        "Open the Meal Plan tab and add recipes from your collection onto any day of the week. Once your plan is set, Pie Keeper automatically combines every ingredient into a single shopping list, grouped for easy shopping. Adjust servings per meal and the list updates on the fly.",
    },
    {
      question: "How do I share my recipes with family?",
      answer:
        "Go to your Profile and tap 'Family Sharing'. Enter the email address of the person you'd like to invite. Once they accept, you'll share a single recipe collection that everyone can add to, edit, and meal plan from. Perfect for households that cook together.",
    },
    {
      question: "What happens to my recipes if a website goes down?",
      answer:
        "When you save a recipe, Pie Keeper stores a complete copy \u2013 title, ingredients, steps, and photo. Your saved recipes don't depend on the original website, so they'll always be available in your collection even if the source page disappears.",
    },
  ];

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <LandingNav />

      {/* ── Hero ──────────────────────────────── */}
      <section
        className="mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-16"
        style={{ maxWidth: 1100, padding: "60px 24px 40px" }}
      >
        {/* Text column */}
        <div
          className="flex-1"
          style={{ animation: "fadeUp 0.6s ease both" }}
        >
          <h1
            className="rf-heading font-bold"
            style={{
              fontSize: "clamp(32px, 5vw, 48px)",
              lineHeight: 1.15,
              color: "var(--text)",
              marginBottom: 16,
            }}
          >
            Your recipes.
            <br />
            Saved, sorted, and ready to cook.
          </h1>
          <p
            style={{
              color: "var(--muted)",
              fontSize: 18,
              lineHeight: 1.6,
              maxWidth: 460,
              marginBottom: 28,
              animation: "fadeUp 0.6s ease 0.15s both",
            }}
          >
            Pie Keeper grabs any recipe from the web, strips the clutter, and keeps it in one tidy
            collection you can meal plan from.
          </p>
          <div
            className="flex flex-wrap gap-3"
            style={{ animation: "fadeUp 0.6s ease 0.3s both" }}
          >
            <a
              href={`${APP_URL}/login?signup=true`}
              className="rf-btn rf-btn-filled"
              style={{ padding: "12px 24px", fontSize: 15 }}
            >
              Get started free
            </a>
            <button
              onClick={scrollToFeatures}
              className="rf-btn rf-btn-primary"
              style={{ padding: "12px 24px", fontSize: 15 }}
            >
              See how it works
            </button>
          </div>
        </div>

        {/* Phone mockup column */}
        <div
          className="flex-1 flex justify-center"
          style={{
            position: "relative",
            animation: "fadeUp 0.8s ease 0.2s both",
          }}
        >
          {/* Floating badges */}
          <FloatingBadge
            className="lp-float-slow lp-float-delay-1"
            style={{ top: 20, left: -20 }}
          >
            <span style={{ fontSize: 18 }}>📋</span>
            <span>19 recipes saved</span>
          </FloatingBadge>

          <FloatingBadge
            className="lp-float lp-float-delay-2"
            style={{ bottom: 80, right: -10 }}
          >
            <span style={{ fontSize: 18 }}>🇮🇹</span>
            <span>Italian</span>
          </FloatingBadge>

          <FloatingBadge
            className="lp-float-slow"
            style={{ top: 100, right: -30 }}
          >
            <span style={{ color: "var(--green)", fontSize: 16 }}>✓</span>
            <span>Added to meal plan</span>
          </FloatingBadge>

          <PhoneMockup
            src="/screenshots/home.png"
            alt="Pie Keeper home screen showing recipe collection"
            style={{ transform: "rotate(3deg)", width: 280 }}
          />
        </div>
      </section>

      {/* ── Benefits ──────────────────────────── */}
      <section
        className="mx-auto"
        style={{ maxWidth: 1100, padding: "60px 24px" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: <Scissors size={24} color="var(--green)" />,
              title: "No more clutter",
              desc: "Save just the recipe – ingredients, steps, and a photo. No life stories.",
              delay: "0s",
            },
            {
              icon: <Search size={24} color="var(--green)" />,
              title: "Find it instantly",
              desc: "Filter by tag, search by name, or browse your whole collection at a glance.",
              delay: "0.1s",
            },
            {
              icon: <CalendarDays size={24} color="var(--green)" />,
              title: "Plan your week",
              desc: "Add recipes to your meal plan and auto-generate a shopping list.",
              delay: "0.2s",
            },
          ].map((b) => (
            <div
              key={b.title}
              className="rf-card lp-reveal"
              style={{ padding: "28px 24px", transitionDelay: b.delay }}
            >
              <div
                className="flex items-center justify-center"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "var(--green-light)",
                  marginBottom: 16,
                }}
              >
                {b.icon}
              </div>
              <h3
                className="rf-heading font-bold text-lg"
                style={{ color: "var(--text)", marginBottom: 8 }}
              >
                {b.title}
              </h3>
              <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
                {b.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features showcase ─────────────────── */}
      <section
        id="features"
        className="mx-auto"
        style={{ maxWidth: 1100, padding: "40px 24px 60px" }}
      >
        <div className="flex flex-col gap-16 md:gap-20">
          <FeatureRow
            title="Save from anywhere"
            description="See a recipe you like? One click saves it to your library. The Chrome extension reads the page, pulls out what matters, and files it away."
            pills={[
              { icon: <Chrome size={14} />, label: "Chrome extension" },
              { icon: <Sparkles size={14} />, label: "AI-powered parsing" },
              { icon: <Tag size={14} />, label: "Auto-tagging" },
            ]}
            screenshot="/screenshots/home.png"
            screenshotAlt="Recipe collection view"
          />

          <FeatureRow
            title="Every detail, beautifully organised"
            description="Ingredients, steps, cook time, servings – all pulled out and laid out cleanly. Adjust servings and the quantities update automatically."
            pills={[
              { icon: <ListChecks size={14} />, label: "Step-by-step view" },
              { icon: <ChefHat size={14} />, label: "Ingredient checklist" },
              { icon: <LayoutGrid size={14} />, label: "Adjustable servings" },
            ]}
            screenshot="/screenshots/detail.png"
            screenshotAlt="Recipe detail view"
            reverse
          />

          <FeatureRow
            title="Plan meals, generate a shopping list"
            description="Add recipes to your weekly plan. Pie Keeper combines all the ingredients into one shopping list – grouped and ready for the supermarket."
            pills={[
              { icon: <CalendarDays size={14} />, label: "Weekly planner" },
              { icon: <ShoppingCart size={14} />, label: "Auto shopping list" },
              { icon: <Tag size={14} />, label: "Grouped by aisle" },
            ]}
            screenshot="/screenshots/mealplan.png"
            screenshotAlt="Meal plan and shopping list view"
          />
        </div>
      </section>

      {/* ── Testimonial ────────────────────────── */}
      <section style={{ background: "var(--warm)", padding: "80px 24px" }}>
        <div
          className="lp-reveal mx-auto"
          style={{ maxWidth: 640, textAlign: "center" }}
        >
          {/* Decorative quote mark */}
          <div
            style={{
              fontSize: 72,
              lineHeight: 1,
              color: "var(--green)",
              opacity: 0.25,
              marginBottom: 8,
              fontFamily: "Georgia, serif",
            }}
          >
            &ldquo;
          </div>

          <blockquote
            className="rf-heading"
            style={{
              fontSize: "clamp(18px, 3vw, 24px)",
              lineHeight: 1.6,
              color: "var(--text)",
              fontWeight: 400,
              fontStyle: "italic",
              margin: "0 0 32px",
            }}
          >
            My favourite recipes were everywhere – bookmarks, screenshots, scraps of paper. Now they're all in one place and I actually cook them again.
          </blockquote>

          {/* Avatar + attribution */}
          <div className="flex flex-col items-center gap-3">
            {/* Inline SVG female avatar */}
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "var(--green-light)",
                border: "2px solid var(--green)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 36 36"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="18" cy="13" r="7" fill="var(--green)" opacity="0.6" />
                <ellipse cx="18" cy="34" rx="13" ry="12" fill="var(--green)" opacity="0.6" />
                {/* Hair */}
                <path
                  d="M10 14c0-6 3.5-10 8-10s8 4 8 10c0 1-0.5 2-1 2.5 0-5-3-9-7-9s-7 4-7 9c-0.5-0.5-1-1.5-1-2.5z"
                  fill="var(--green)"
                  opacity="0.45"
                />
              </svg>
            </div>
            <div>
              <span
                className="rf-heading font-bold"
                style={{ fontSize: 16, color: "var(--text)" }}
              >
                Dafne
              </span>
              <span style={{ color: "var(--muted)", fontSize: 14 }}>
                {" "}· Home Cook, Melbourne
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── How To ──────────────────────────────── */}
      <section
        className="mx-auto"
        style={{ maxWidth: 700, padding: "80px 24px" }}
      >
        <div className="lp-reveal" style={{ textAlign: "center", marginBottom: 40 }}>
          <h2
            className="rf-heading font-bold"
            style={{
              fontSize: "clamp(24px, 4vw, 36px)",
              color: "var(--text)",
              marginBottom: 12,
            }}
          >
            How to use Pie Keeper
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 16 }}>
            Everything you need to know to get started.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {howToItems.map((item, i) => (
            <div key={i} className="lp-reveal" style={{ transitionDelay: `${i * 0.06}s` }}>
              <AccordionItem
                question={item.question}
                answer={item.answer}
                isOpen={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? null : i)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────── */}
      <section
        style={{ background: "var(--green-light)", padding: "80px 24px" }}
      >
        <div
          className="lp-reveal mx-auto text-center"
          style={{ maxWidth: 500 }}
        >
          <h2
            className="rf-heading font-bold"
            style={{ fontSize: "clamp(24px, 4vw, 36px)", color: "var(--text)", marginBottom: 12 }}
          >
            Start building your recipe collection
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 16, marginBottom: 28 }}>
            Free to use. No credit card needed.
          </p>
          <a
            href={`${APP_URL}/login?signup=true`}
            className="rf-btn rf-btn-filled"
            style={{ padding: "14px 32px", fontSize: 16 }}
          >
            Get started
          </a>
        </div>
      </section>

      {/* ── Footer ────────────────────────────── */}
      <footer
        className="text-center"
        style={{ padding: "24px", color: "var(--muted)", fontSize: 13 }}
      >
        <span className="rf-heading font-semibold" style={{ color: "var(--text)" }}>
          Pie Keeper
        </span>{" "}
        · Built with care in Melbourne
      </footer>
    </div>
  );
}
