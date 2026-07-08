// LandingPageV2 — editorial "cookbook" landing, ported from the Claude Design
// bundle (pie-keeper / "Landing Page.html"). Built standalone for now, behind a
// dev route, with the intent of replacing LandingPage.tsx later.
//
// The marketing markup is rendered verbatim (faithful to the prototype) and the
// three iOS phone mockups are mounted as React into placeholder slots, mirroring
// the prototype's mount.jsx. All styles are scoped under `.pk2` so nothing leaks
// into the rest of the app while this lives alongside the current landing.

import { useEffect, useRef, memo } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Search,
  SlidersHorizontal,
  Heart,
  Clock,
  Users,
  Flame,
  Check,
  Minus,
  Plus,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  House,
  CalendarDays,
  PlusCircle,
  BookOpen,
  User,
} from "lucide-react";

const APP_URL = import.meta.env.VITE_APP_URL || "https://app.piekeeper.com";

/* ─────────────────────────────────────────────────────────────
   Palette (shared by markup + phone mockups)
   ───────────────────────────────────────────────────────────── */
const PK_GREEN = "#3D6B4E";
const PK_PAPER = "#FBF8F1"; // cream card / input surface (--card)
const PK_INK = "#1F1B16";
const PK_INK_SOFT = "#4A4339";
const PK_INK_MUTE = "#847A6B";
// Editorial ground + panel tones (mirror the app's light-theme CSS vars)
const PK_BG = "#ECE4D3"; // page ground — warm paper (--bg)
const PK_SHEET = "#F5EFE2"; // editorial "sheet" panel (--paper)
const PK_PAPER3 = "#EFE7D4"; // image placeholder tint (--paper3)
const PK_WARM = "#EFE7D4"; // hover / track ground (--warm)
const PK_BORDER = "rgba(31,27,22,0.14)";
const PK_RULE_HAIR = "rgba(31,27,22,0.055)";
const PK_RED = "#b84a2b"; // favourite heart (--red)

const fSerif = '"Newsreader", Georgia, serif';
const fSans = '"DM Sans", system-ui, -apple-system, sans-serif';
const fMono = '"JetBrains Mono", ui-monospace, Menlo, monospace';

function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let out = "";
  for (const [val, sym] of map) {
    while (n >= val) {
      out += sym;
      n -= val;
    }
  }
  return out;
}

// Mono uppercase eyebrow with a leading hairline — the app's editorial label.
function Eyebrow({ children, color = PK_INK_MUTE }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: fMono, fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color }}>
      <span style={{ width: 16, height: 1, background: color, opacity: 0.6 }} />
      <span>{children}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   iOS device frame (trimmed to what the mockups use)
   ───────────────────────────────────────────────────────────── */
function IOSStatusBar({ time = "9:41", color = "#000" }: { time?: string; color?: string }) {
  const c = color;
  return (
    <div
      style={{
        display: "flex",
        gap: 154,
        alignItems: "center",
        justifyContent: "center",
        padding: "21px 24px 19px",
        boxSizing: "border-box",
        position: "relative",
        zIndex: 20,
        width: "100%",
      }}
    >
      <div style={{ flex: 1, height: 22, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 1.5 }}>
        <span style={{ fontFamily: '-apple-system, "SF Pro", system-ui', fontWeight: 590, fontSize: 17, lineHeight: "22px", color: c }}>
          {time}
        </span>
      </div>
      <div style={{ flex: 1, height: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, paddingTop: 1, paddingRight: 1 }}>
        <svg width="19" height="12" viewBox="0 0 19 12">
          <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill={c} />
          <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill={c} />
          <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill={c} />
          <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill={c} />
        </svg>
        <svg width="17" height="12" viewBox="0 0 17 12">
          <path d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z" fill={c} />
          <path d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z" fill={c} />
          <circle cx="8.5" cy="10.5" r="1.5" fill={c} />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={c} strokeOpacity="0.35" fill="none" />
          <rect x="2" y="2" width="20" height="9" rx="2" fill={c} />
          <path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill={c} fillOpacity="0.4" />
        </svg>
      </div>
    </div>
  );
}

function IOSDevice({ children, width = 340, height = 720, statusColor = "#000" }: { children: React.ReactNode; width?: number; height?: number; statusColor?: string }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 48,
        overflow: "hidden",
        position: "relative",
        background: PK_BG,
        boxShadow: "0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)",
        fontFamily: "-apple-system, system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* status bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
        <IOSStatusBar color={statusColor} />
      </div>
      {/* content */}
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>{children}</div>
      </div>
      {/* home indicator */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 60, height: 34, display: "flex", justifyContent: "center", alignItems: "flex-end", paddingBottom: 8, pointerEvents: "none" }}>
        <div style={{ width: 139, height: 5, borderRadius: 100, background: "rgba(0,0,0,0.25)" }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Shared phone bits
   ───────────────────────────────────────────────────────────── */
function PKTabBar({ active = "home" }: { active?: string }) {
  const tabs = [
    { k: "home", label: "Home", Icon: House },
    { k: "plan", label: "Plan", Icon: CalendarDays },
    { k: "add", label: "Add", Icon: PlusCircle },
    { k: "cook", label: "Cookbook", Icon: BookOpen },
    { k: "me", label: "Profile", Icon: User },
  ];
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: 26,
        paddingTop: 9,
        background: "rgba(251,248,241,0.9)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: `1px solid ${PK_BORDER}`,
        display: "flex",
        justifyContent: "space-around",
        alignItems: "flex-start",
        fontFamily: fSans,
        zIndex: 40,
      }}
    >
      {tabs.map(({ k, label, Icon }) => {
        const on = active === k;
        return (
          <div key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: on ? PK_GREEN : PK_INK_MUTE }}>
            <Icon size={on ? 22 : 20} strokeWidth={on ? 2.2 : 1.8} />
            <div style={{ fontSize: 10, fontWeight: on ? 600 : 500 }}>{label}</div>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: PK_GREEN, opacity: on ? 1 : 0 }} />
          </div>
        );
      })}
    </div>
  );
}

/* ── Screen 1: Library / browse ──────────────────────────────── */
function PhoneLibrary() {
  const recipes = [
    { name: "Slow-roasted Tomato Pasta", meta: "45m · 4 serves", img: "/landing/tomato-pasta.jpg", fav: true },
    { name: "Charred Broccoli Salad", meta: "20m · 2 serves", img: "/landing/broccoli.jpg" },
    { name: "Brown Butter Cookies", meta: "30m · 24 serves", img: "/landing/cookies.jpg" },
    { name: "Miso Glazed Salmon", meta: "25m · 4 serves", img: "/landing/salmon.jpg", fav: true },
  ];
  return (
    <IOSDevice width={340} height={720}>
      <div style={{ height: "100%", overflow: "hidden", background: PK_BG, position: "relative" }}>
        {/* Editorial masthead */}
        <div style={{ padding: "60px 20px 0" }}>
          <Eyebrow>The kitchen</Eyebrow>
          <div style={{ margin: "11px 0 0", fontFamily: fSerif, fontWeight: 400, fontSize: 30, lineHeight: 1.02, letterSpacing: "-0.026em", color: PK_INK }}>
            What's for dinner, <em style={{ fontStyle: "italic", color: PK_GREEN }}>Yann</em>?
          </div>
          <div style={{ margin: "10px 0 0", fontFamily: fSans, fontSize: 13, lineHeight: 1.45, color: PK_INK_SOFT }}>
            You have 19 recipes saved.
          </div>

          {/* Search + filter */}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={15} strokeWidth={2} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: PK_INK_MUTE }} />
              <div style={{ background: PK_PAPER, border: `1px solid ${PK_BORDER}`, borderRadius: 10, padding: "11px 12px 11px 34px", fontFamily: fSans, fontSize: 13, color: PK_INK_MUTE }}>
                Search recipes...
              </div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: PK_PAPER, border: `1px solid ${PK_BORDER}`, display: "grid", placeItems: "center", color: PK_INK_MUTE }}>
              <SlidersHorizontal size={17} strokeWidth={2} />
            </div>
          </div>
        </div>

        {/* Card grid — editorial photo + serif caption + mono meta */}
        <div style={{ padding: "18px 20px 110px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {recipes.map((r, i) => (
            <div key={i}>
              <div style={{ position: "relative", aspectRatio: "4 / 5", borderRadius: 4, overflow: "hidden", background: PK_PAPER3 }}>
                <img src={r.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "saturate(0.92) contrast(1.02)" }} />
                <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }} />
                <div style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: "50%", background: "rgba(251,248,241,0.92)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center" }}>
                  <Heart size={13} strokeWidth={1.8} fill={r.fav ? PK_RED : "none"} color={r.fav ? PK_RED : PK_INK_MUTE} />
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontFamily: fSerif, fontWeight: 400, fontSize: 15, lineHeight: 1.15, letterSpacing: "-0.015em", color: PK_INK }}>{r.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, fontFamily: fMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: PK_INK_MUTE }}>
                  <Clock size={10} strokeWidth={1.6} /> {r.meta}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <PKTabBar active="home" />
    </IOSDevice>
  );
}

/* ── Screen 2: Recipe detail ─────────────────────────────────── */
function PhoneRecipe() {
  const ingredients = [
    { name: "Ripe tomatoes, halved", qty: "6" },
    { name: "Garlic, smashed", qty: "4 cloves" },
    { name: "Good olive oil", qty: "3 tbsp" },
    { name: "Chilli flakes", qty: "1 tsp" },
    { name: "Rigatoni", qty: "400 g" },
    { name: "Basil, torn", qty: "handful" },
  ];
  const meta = [
    { Icon: Clock, label: "Prep", value: "15m" },
    { Icon: Flame, label: "Cook", value: "30m" },
    { Icon: Users, label: "Serves", value: "4" },
  ];
  return (
    <IOSDevice width={340} height={720} statusColor="#fff">
      <div style={{ height: "100%", overflow: "hidden", background: PK_BG, position: "relative" }}>
        {/* Full-bleed hero, fading into the paper ground */}
        <div style={{ position: "relative", height: 208, background: PK_PAPER3 }}>
          <img src="/landing/tomato-pasta.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(31,27,22,0.30) 0%, rgba(31,27,22,0) 30%, ${PK_BG}00 58%, ${PK_BG} 100%)` }} />
          <div style={{ position: "absolute", top: 52, right: 16, width: 34, height: 34, borderRadius: "50%", background: "rgba(251,248,241,0.92)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center" }}>
            <Heart size={16} strokeWidth={1.8} fill={PK_RED} color={PK_RED} />
          </div>
        </div>

        <div style={{ padding: "4px 20px 0" }}>
          <div style={{ fontFamily: fMono, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: PK_INK_MUTE, marginBottom: 10 }}>Italian · Pasta</div>
          <div style={{ fontFamily: fSerif, fontWeight: 400, fontSize: 28, lineHeight: 1.05, letterSpacing: "-0.02em", color: PK_INK }}>Slow-roasted Tomato Pasta</div>
          <div style={{ marginTop: 10, fontFamily: fSans, fontSize: 13, lineHeight: 1.5, color: PK_INK_SOFT }}>
            Sweet, jammy tomatoes roasted low and slow, then tossed through rigatoni with torn basil.
          </div>

          {/* Meta cards */}
          <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
            {meta.map(({ Icon, label, value }) => (
              <div key={label} style={{ flex: 1, background: PK_PAPER, border: `1px solid ${PK_BORDER}`, borderRadius: 4, padding: "10px 11px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: fMono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: PK_INK_MUTE }}>
                  <Icon size={10} strokeWidth={1.6} /> {label}
                </div>
                <div style={{ fontFamily: fSerif, fontSize: 20, color: PK_INK, marginTop: 3 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Tabs + serving stepper */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, borderBottom: `1px solid ${PK_BORDER}`, marginTop: 20 }}>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ paddingBottom: 10, marginBottom: -1, fontFamily: fSerif, fontSize: 17, color: PK_INK, borderBottom: `2px solid ${PK_GREEN}` }}>
                Ingredients <span style={{ fontFamily: fMono, fontSize: 10, color: PK_INK_MUTE }}>· 6</span>
              </div>
              <div style={{ paddingBottom: 10, fontFamily: fSerif, fontSize: 17, color: PK_INK_MUTE }}>
                Steps <span style={{ fontFamily: fMono, fontSize: 10, color: PK_INK_MUTE }}>· 5</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7, border: `1px solid ${PK_BORDER}`, borderRadius: 999, padding: 3, background: PK_PAPER }}>
              <div style={{ width: 22, height: 22, borderRadius: 999, border: `1px solid ${PK_BORDER}`, background: PK_PAPER, color: PK_INK_MUTE, display: "grid", placeItems: "center" }}><Minus size={11} strokeWidth={2} /></div>
              <span style={{ fontFamily: fSerif, fontSize: 13, color: PK_INK }}>4<span style={{ fontFamily: fMono, fontSize: 8.5, color: PK_INK_MUTE }}> sv</span></span>
              <div style={{ width: 22, height: 22, borderRadius: 999, background: PK_GREEN, color: "#fbf8f1", display: "grid", placeItems: "center" }}><Plus size={11} strokeWidth={2} /></div>
            </div>
          </div>

          {/* Paper panel — ingredient checklist */}
          <div style={{ marginTop: 16, marginBottom: 110, background: PK_SHEET, border: `1px solid ${PK_RULE_HAIR}`, borderRadius: 6, padding: 16 }}>
            {ingredients.map((ing, i) => {
              const done = i < 2;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: i < ingredients.length - 1 ? `1px solid ${PK_RULE_HAIR}` : "none" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${done ? PK_GREEN : PK_BORDER}`, background: done ? PK_GREEN : "transparent", display: "grid", placeItems: "center" }}>
                    {done && <Check size={12} strokeWidth={3} color="#fbf8f1" />}
                  </span>
                  <span style={{ flex: 1, fontFamily: fSerif, fontSize: 14.5, letterSpacing: "-0.01em", color: done ? PK_INK_MUTE : PK_INK, textDecoration: done ? "line-through" : "none" }}>{ing.name}</span>
                  <span style={{ fontFamily: fMono, fontSize: 10, letterSpacing: "0.04em", color: PK_INK_MUTE, flexShrink: 0 }}>{ing.qty}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <PKTabBar active="home" />
    </IOSDevice>
  );
}

/* ── Screen 3: Meal plan + shopping list ─────────────────────── */
function PhonePlan() {
  const groups = [
    { cat: "Produce", items: [
      { name: "Ripe tomatoes", qty: "6", done: true },
      { name: "Broccoli", qty: "2 heads", done: true },
      { name: "Basil", qty: "1 bunch" },
      { name: "Garlic", qty: "4 cloves" },
    ] },
    { cat: "Protein", items: [
      { name: "Salmon fillet", qty: "400 g" },
      { name: "Chicken breast", qty: "2" },
    ] },
    { cat: "Pantry", items: [
      { name: "Rigatoni", qty: "400 g" },
      { name: "White miso paste", qty: "2 tbsp" },
    ] },
  ];
  return (
    <IOSDevice width={340} height={720}>
      <div style={{ height: "100%", overflow: "hidden", background: PK_BG, position: "relative" }}>
        {/* Masthead */}
        <div style={{ padding: "60px 20px 0" }}>
          <Eyebrow>The plan</Eyebrow>
          <div style={{ margin: "11px 0 0", fontFamily: fSerif, fontWeight: 400, fontSize: 30, lineHeight: 1.02, letterSpacing: "-0.026em", color: PK_INK }}>
            Meal <em style={{ fontStyle: "italic", color: PK_GREEN }}>Plan</em>
          </div>
          <div style={{ margin: "9px 0 0", fontFamily: fSans, fontSize: 13, lineHeight: 1.45, color: PK_INK_SOFT }}>
            4 meals planned · 12 things to buy.
          </div>

          {/* Week switcher rail */}
          <div style={{ border: `1px solid ${PK_BORDER}`, borderRadius: 4, background: PK_PAPER, padding: "12px 14px", marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 999, border: `1px solid ${PK_BORDER}`, display: "grid", placeItems: "center", color: PK_INK_MUTE }}><ChevronLeft size={15} /></div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: fSerif, fontSize: 17, letterSpacing: "-0.015em", color: PK_INK, whiteSpace: "nowrap" }}>Week of 11 May</div>
                <div style={{ marginTop: 4, fontFamily: fMono, fontSize: 9, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: PK_GREEN }}>This week</div>
              </div>
              <div style={{ width: 28, height: 28, borderRadius: 999, border: `1px solid ${PK_BORDER}`, display: "grid", placeItems: "center", color: PK_INK_MUTE }}><ChevronRight size={15} /></div>
            </div>
            <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${PK_RULE_HAIR}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: fMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: PK_INK_MUTE, marginBottom: 7 }}>
                <span>2 of 4 cooked</span><span>50%</span>
              </div>
              <div style={{ height: 4, borderRadius: 9999, background: PK_WARM, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "50%", borderRadius: 9999, background: PK_GREEN }} />
              </div>
            </div>
          </div>

          {/* Editorial tabs */}
          <div style={{ display: "flex", gap: 26, borderBottom: `1px solid ${PK_BORDER}`, marginTop: 18 }}>
            <div style={{ paddingBottom: 10, marginBottom: -1, fontFamily: fSerif, fontSize: 17, color: PK_INK_MUTE }}>
              Meals <span style={{ fontFamily: fMono, fontSize: 10 }}>· 4</span>
            </div>
            <div style={{ paddingBottom: 10, marginBottom: -1, fontFamily: fSerif, fontSize: 17, color: PK_INK, borderBottom: `2px solid ${PK_GREEN}` }}>
              Groceries <span style={{ fontFamily: fMono, fontSize: 10, color: PK_INK_MUTE }}>· 12</span>
            </div>
          </div>
        </div>

        {/* Shopping list */}
        <div style={{ padding: "16px 20px 110px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 12, marginBottom: 16, borderBottom: `1px solid ${PK_BORDER}` }}>
            <span style={{ fontFamily: fMono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: PK_INK_MUTE }}>Shopping list</span>
            <span style={{ fontFamily: fMono, fontSize: 10, letterSpacing: "0.04em", color: PK_INK_MUTE }}>2/12 ticked</span>
          </div>
          {groups.map((g, gi) => (
            <div key={g.cat} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, paddingBottom: 7, borderBottom: `1px solid ${PK_BORDER}`, marginBottom: 2 }}>
                <span style={{ fontFamily: fSerif, fontStyle: "italic", color: PK_GREEN, fontSize: 12 }}>{toRoman(gi + 1)}.</span>
                <span style={{ flex: 1, fontFamily: fSerif, fontSize: 17, fontWeight: 400, letterSpacing: "-0.015em", color: PK_INK }}>{g.cat}</span>
                <span style={{ fontFamily: fMono, fontSize: 10, color: PK_INK_MUTE }}>{g.items.length}</span>
              </div>
              {g.items.map((it, i) => {
                const done = "done" in it && it.done;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: i < g.items.length - 1 ? `1px solid ${PK_RULE_HAIR}` : "none", opacity: done ? 0.5 : 1 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${done ? PK_GREEN : PK_BORDER}`, background: done ? PK_GREEN : "transparent", display: "grid", placeItems: "center" }}>
                      {done && <Check size={12} strokeWidth={3} color="#fbf8f1" />}
                    </span>
                    <span style={{ flex: 1, fontFamily: fSerif, fontSize: 14.5, letterSpacing: "-0.01em", color: done ? PK_INK_MUTE : PK_INK, textDecoration: done ? "line-through" : "none" }}>{it.name}</span>
                    <span style={{ fontFamily: fMono, fontSize: 10, letterSpacing: "0.04em", color: PK_INK_MUTE }}>{it.qty}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <PKTabBar active="plan" />
    </IOSDevice>
  );
}

/* ── Screen 4: Cookbooks / shelves ───────────────────────────── */
function PhoneCookbook() {
  const books = [
    {
      name: "Weeknight Dinners",
      count: 12,
      desc: "Fast, no-fuss favourites",
      covers: ["/landing/tomato-pasta.jpg", "/landing/salmon.jpg", "/landing/broccoli.jpg", "/landing/cookies.jpg"],
    },
    {
      name: "Sunday Baking",
      count: 8,
      desc: "Slow mornings, warm oven",
      covers: ["/landing/cookies.jpg", "/landing/hero.jpg", "/landing/tomato-pasta.jpg", "/landing/broccoli.jpg"],
    },
  ];
  return (
    <IOSDevice width={340} height={720}>
      <div style={{ height: "100%", overflow: "hidden", background: PK_BG, position: "relative" }}>
        {/* Masthead + Suggest */}
        <div style={{ padding: "60px 20px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <Eyebrow>The shelves</Eyebrow>
              <div style={{ margin: "11px 0 0", fontFamily: fSerif, fontWeight: 400, fontSize: 30, lineHeight: 1.02, letterSpacing: "-0.026em", color: PK_INK }}>
                Cookbooks
              </div>
              <div style={{ margin: "9px 0 0", fontFamily: fSans, fontSize: 13, lineHeight: 1.45, color: PK_INK_SOFT }}>
                6 cookbooks · drag to reorder.
              </div>
            </div>
            <div style={{ flexShrink: 0, padding: "8px 13px", color: PK_INK, border: `1px solid ${PK_BORDER}`, borderRadius: 999, fontFamily: fSans, fontSize: 12, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Sparkles size={13} strokeWidth={1.6} /> Suggest
            </div>
          </div>
        </div>

        {/* Shelf rows */}
        <div style={{ padding: "18px 20px 110px", display: "flex", flexDirection: "column", gap: 18 }}>
          {books.map((b, bi) => (
            <div key={bi}>
              {/* Title row: index · name · count */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 9 }}>
                <span style={{ fontFamily: fSerif, fontStyle: "italic", color: PK_GREEN, fontSize: 13 }}>{String(bi + 1).padStart(2, "0")}.</span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: fSerif, fontSize: 19, fontWeight: 400, letterSpacing: "-0.018em", color: PK_INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>
                <span style={{ fontFamily: fMono, fontSize: 9, color: PK_INK_MUTE, letterSpacing: "0.08em", textTransform: "uppercase" }}>{b.count} recipes</span>
              </div>
              {/* Photo strip — 4 plates across */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, borderTop: `1px solid ${PK_BORDER}`, paddingTop: 9 }}>
                {b.covers.map((src, i) => (
                  <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 3, overflow: "hidden", background: PK_PAPER3 }}>
                    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "saturate(0.92) contrast(1.02)" }} />
                    <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }} />
                  </div>
                ))}
              </div>
              {/* Footer: description · Open → */}
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: fSerif, fontStyle: "italic", fontSize: 12.5, color: PK_INK_MUTE, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.desc}</span>
                <span style={{ color: PK_INK, borderBottom: `1px solid ${PK_INK}`, paddingBottom: 1, fontSize: 11.5, flexShrink: 0 }}>Open →</span>
              </div>
            </div>
          ))}

          {/* New cookbook — dashed editorial row */}
          <div style={{ padding: "15px 16px", border: `1px dashed ${PK_GREEN}`, borderRadius: 4, color: PK_GREEN, display: "flex", alignItems: "center", gap: 11 }}>
            <Plus size={17} strokeWidth={1.6} />
            <span style={{ fontFamily: fSerif, fontSize: 15, fontStyle: "italic" }}>New cookbook</span>
          </div>
        </div>
      </div>
      <PKTabBar active="cook" />
    </IOSDevice>
  );
}

/* ─────────────────────────────────────────────────────────────
   Scoped stylesheet (verbatim from the prototype, namespaced .pk2)
   ───────────────────────────────────────────────────────────── */
const STYLES = `
.pk2 {
  --ink: #1F1B16;
  --ink-soft: #4A4339;
  --ink-mute: #847A6B;
  --paper: #F5EFE2;
  --paper-2: #FBF6EA;
  --paper-3: #EFE7D4;
  --rule: #1F1B1620;
  --rule-soft: #1F1B1612;
  --green: #3D6B4E;
  --green-deep: #2F5440;
  --green-soft: #E5ECDF;
  --terracotta: #C8633F;
  --cream-card: #FBF8F1;

  position: relative;
  min-height: 100vh;
  font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--paper);
  font-size: 17px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  letter-spacing: -0.005em;
}
.pk2 *, .pk2 *::before, .pk2 *::after { box-sizing: border-box; }

.pk2::before {
  content: "";
  position: fixed; inset: 0;
  pointer-events: none; z-index: 1;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.12  0 0 0 0 0.10  0 0 0 0 0.06  0 0 0 0.45 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>");
  background-size: 220px 220px;
  mix-blend-mode: multiply;
  opacity: 0.18;
}

.pk2 .serif { font-family: "Newsreader", "Source Serif 4", Georgia, serif; font-weight: 400; letter-spacing: -0.018em; }
.pk2 .mono  { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase; font-size: 11.5px; }

.pk2 .wrap { max-width: 1280px; margin: 0 auto; padding: 0 40px; position: relative; z-index: 2; }
.pk2 .wrap-narrow { max-width: 980px; margin: 0 auto; padding: 0 40px; position: relative; z-index: 2; }

.pk2 .nav {
  position: sticky; top: 0; z-index: 50;
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  background: color-mix(in srgb, var(--paper) 78%, transparent);
  border-bottom: 1px solid var(--rule-soft);
}
.pk2 .nav-inner {
  max-width: 1280px; margin: 0 auto;
  padding: 18px 40px;
  display: flex; align-items: center; justify-content: space-between;
}
.pk2 .brand {
  display: flex; align-items: center; gap: 10px;
  font-family: "Newsreader", serif; font-weight: 500; font-size: 22px; color: var(--ink); letter-spacing: -0.01em;
}
.pk2 .brand-mark {
  width: 30px; height: 30px; border-radius: 8px;
  background: var(--green); color: var(--paper-2);
  display: grid; place-items: center;
  font-family: "Newsreader", serif; font-weight: 500; font-size: 18px;
  font-style: italic;
}
.pk2 .nav-links { display: flex; gap: 36px; align-items: center; }
.pk2 .nav-links a { color: var(--ink-soft); text-decoration: none; font-size: 14.5px; }
.pk2 .nav-links a:hover { color: var(--ink); }
.pk2 .nav-cta { display: flex; gap: 10px; align-items: center; }

.pk2 .btn {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: "DM Sans", sans-serif; font-weight: 500; font-size: 14.5px;
  padding: 11px 18px; border-radius: 999px;
  border: 1px solid transparent; cursor: pointer; text-decoration: none;
  transition: transform .15s ease, background .15s ease, border-color .15s ease;
}
.pk2 .btn:hover { transform: translateY(-1px); }
.pk2 .btn-primary { background: var(--green); color: #FBF8F1; }
.pk2 .btn-primary:hover { background: var(--green-deep); }
.pk2 .btn-ghost { background: transparent; color: var(--ink); border-color: var(--rule); }
.pk2 .btn-ghost:hover { background: #1F1B1608; }
.pk2 .btn-link { background: transparent; color: var(--ink); padding: 11px 4px; border-radius: 0; border-bottom: 1px solid var(--ink); }
.pk2 .btn-lg { padding: 15px 26px; font-size: 16px; }

.pk2 .eyebrow { display: inline-flex; align-items: center; gap: 10px; color: var(--ink-mute); }
.pk2 .eyebrow::before { content: ""; width: 24px; height: 1px; background: var(--ink-mute); }
.pk2 .eyebrow.no-rule::before { display: none; }

.pk2 h1, .pk2 h2, .pk2 h3, .pk2 h4 { margin: 0; font-weight: 400; }
.pk2 .display {
  font-family: "Newsreader", serif; font-weight: 400;
  font-size: clamp(56px, 8.4vw, 132px); line-height: 0.95; letter-spacing: -0.035em;
}
.pk2 .display em { font-style: italic; font-weight: 400; color: var(--green); }
.pk2 .h-section {
  font-family: "Newsreader", serif; font-weight: 400;
  font-size: clamp(40px, 5.2vw, 72px); line-height: 1.0; letter-spacing: -0.025em;
}
.pk2 .h-section em { font-style: italic; color: var(--green); font-weight: 400; }
.pk2 .h-feature {
  font-family: "Newsreader", serif; font-weight: 400;
  font-size: clamp(28px, 3vw, 40px); line-height: 1.05; letter-spacing: -0.02em;
}
.pk2 .lede { font-size: 19px; line-height: 1.5; color: var(--ink-soft); max-width: 46ch; }

.pk2 section { position: relative; z-index: 2; }
.pk2 [id] { scroll-margin-top: 92px; }
.pk2 .section-pad { padding: 140px 0; }
.pk2 .section-pad-sm { padding: 96px 0; }

.pk2 .hero { padding: 56px 0 0; position: relative; }
.pk2 .hero-grid { display: grid; grid-template-columns: 1fr; gap: 64px; align-items: end; }
.pk2 .hero-meta {
  display: flex; justify-content: space-between; align-items: end;
  gap: 40px; margin-top: 28px; padding-top: 28px; border-top: 1px solid var(--rule);
}
.pk2 .hero-meta-col { max-width: 38ch; }
.pk2 .hero-meta-col p { margin: 0; color: var(--ink-soft); font-size: 16px; line-height: 1.5; }
.pk2 .hero-cta-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 12px; }

.pk2 .hero-image {
  margin-top: 64px; position: relative;
  height: clamp(420px, 56vw, 720px); border-radius: 4px; overflow: hidden; background: var(--paper-3);
}
.pk2 .hero-image img { width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(0.95) contrast(1.02); }
.pk2 .hero-image::after { content: ""; position: absolute; inset: 0; box-shadow: inset 0 0 0 1px #00000010; pointer-events: none; }

.pk2 .img-caption { position: absolute; left: 24px; bottom: 22px; color: #FBF8F1; mix-blend-mode: difference; max-width: 28ch; }
.pk2 .img-caption .mono { display: block; opacity: 0.75; margin-bottom: 4px; }

.pk2 .stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
  border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); margin-top: 96px;
}
.pk2 .stats-note { margin-top: 96px; text-align: center; }
.pk2 .stats-note .eyebrow { color: var(--ink-mute); opacity: 0.7; }
.pk2 .stats.stats--noted { margin-top: 20px; }
.pk2 .stat { padding: 36px 28px; border-right: 1px solid var(--rule-soft); }
.pk2 .stat:last-child { border-right: none; }
.pk2 .stat-num { font-family: "Newsreader", serif; font-size: 48px; line-height: 1; letter-spacing: -0.03em; font-weight: 400; }
.pk2 .stat-num em { font-style: italic; color: var(--green); }
.pk2 .stat-label { color: var(--ink-mute); font-size: 13.5px; margin-top: 10px; }

.pk2 .press { padding: 48px 0 0; display: flex; align-items: center; justify-content: space-between; gap: 40px; flex-wrap: wrap; }
.pk2 .press-label { color: var(--ink-mute); font-size: 13px; }
.pk2 .press-logos { display: flex; gap: 56px; align-items: center; flex-wrap: wrap; opacity: 0.62; }
.pk2 .press-logo { font-family: "Newsreader", serif; font-size: 22px; color: var(--ink); letter-spacing: -0.01em; white-space: nowrap; }
.pk2 .press-logo.italic { font-style: italic; }
.pk2 .press-logo.bold { font-weight: 700; letter-spacing: -0.02em; }
.pk2 .press-logo.upper { font-family: "DM Sans", sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; font-size: 13px; }
.pk2 .press-logo.script { font-family: "Newsreader", serif; font-style: italic; font-weight: 500; }

.pk2 .three-up { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-top: 1px solid var(--rule); }
.pk2 .feature-card { padding: 56px 36px 56px 0; border-right: 1px solid var(--rule-soft); display: flex; flex-direction: column; gap: 18px; }
.pk2 .feature-card:not(:first-child) { padding-left: 36px; }
.pk2 .feature-card:last-child { border-right: none; padding-right: 0; }
.pk2 .feature-num { font-family: "Newsreader", serif; font-style: italic; font-size: 22px; color: var(--green); }
.pk2 .feature-title { font-family: "Newsreader", serif; font-size: 30px; line-height: 1.05; letter-spacing: -0.02em; }
.pk2 .feature-body { color: var(--ink-soft); font-size: 16px; line-height: 1.55; }
.pk2 .feature-foot { margin-top: auto; padding-top: 18px; color: var(--ink-mute); font-size: 13px; display: flex; align-items: center; gap: 8px; }

.pk2 .alt { display: grid; grid-template-columns: 1fr 1fr; gap: 100px; align-items: center; }
.pk2 .alt.reverse > div:first-child { order: 2; }
.pk2 .alt-label { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
.pk2 .alt-label .num { font-family: "Newsreader", serif; font-style: italic; font-size: 28px; color: var(--green); }
.pk2 .alt-body { color: var(--ink-soft); font-size: 17px; line-height: 1.55; max-width: 44ch; margin-top: 22px; }
.pk2 .feat-list { margin: 28px 0 0; padding: 0; list-style: none; }
.pk2 .feat-list li { padding: 14px 0; border-top: 1px solid var(--rule-soft); display: flex; justify-content: space-between; align-items: baseline; gap: 20px; font-size: 15px; }
.pk2 .feat-list li:last-child { border-bottom: 1px solid var(--rule-soft); }
.pk2 .feat-list .k { color: var(--ink); font-weight: 500; }
.pk2 .feat-list .v { color: var(--ink-mute); font-family: "JetBrains Mono", monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }

.pk2 .phone-slot { display: flex; justify-content: center; align-items: center; }
.pk2 .phone-slot.tilt-l { transform: rotate(-2.5deg); }
.pk2 .phone-slot.tilt-r { transform: rotate(2deg); }
.pk2 .phone-shadow { filter: drop-shadow(0 30px 60px rgba(31,27,22,0.18)) drop-shadow(0 8px 16px rgba(31,27,22,0.10)); }

.pk2 .photo-card { position: relative; border-radius: 4px; overflow: hidden; background: var(--paper-3); aspect-ratio: 4/5; width: 100%; }
.pk2 .photo-card img { width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(0.95) contrast(1.02); }

.pk2 .ext-band { background: var(--green); color: var(--paper-2); padding: 120px 0; position: relative; overflow: hidden; }
.pk2 .ext-band::before {
  content: ""; position: absolute; inset: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.4 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>");
  mix-blend-mode: overlay; opacity: 0.25; pointer-events: none;
}
.pk2 .ext-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 80px; align-items: center; position: relative; z-index: 2; }
.pk2 .ext-band .eyebrow, .pk2 .ext-band .eyebrow::before { color: rgba(251,248,241,0.7); background: rgba(251,248,241,0.5); }
.pk2 .ext-band .h-section { color: var(--paper-2); }
.pk2 .ext-band .h-section em { color: #E8C09A; }
.pk2 .ext-band .lede { color: rgba(251,248,241,0.8); }
.pk2 .ext-band .btn-primary { background: var(--paper-2); color: var(--green-deep); }
.pk2 .ext-band .btn-primary:hover { background: #fff; }
.pk2 .ext-band .btn-ghost { color: var(--paper-2); border-color: rgba(251,248,241,0.3); }
.pk2 .ext-band .btn-ghost:hover { background: rgba(251,248,241,0.1); }

.pk2 .browser { background: #FBF8F1; border-radius: 12px; overflow: hidden; box-shadow: 0 40px 80px rgba(0,0,0,0.3), 0 12px 24px rgba(0,0,0,0.18); transform: rotate(-1deg); }
.pk2 .browser-bar { background: #E8E2D2; padding: 12px 16px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #00000010; }
.pk2 .browser-dots { display: flex; gap: 6px; }
.pk2 .browser-dots span { width: 11px; height: 11px; border-radius: 50%; background: #C8C2B2; }
.pk2 .browser-url { flex: 1; background: #FBF8F1; border-radius: 6px; padding: 6px 12px; font-size: 12px; color: var(--ink-soft); display: flex; align-items: center; gap: 8px; font-family: "DM Sans", sans-serif; }
.pk2 .browser-body { padding: 0; position: relative; min-height: 320px; background: #fff; }
.pk2 .recipe-page { padding: 28px 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.pk2 .recipe-page-img { aspect-ratio: 4/3; border-radius: 6px; overflow: hidden; background: var(--paper-3); }
.pk2 .recipe-page-img img { width: 100%; height: 100%; object-fit: cover; }
.pk2 .recipe-page-text h4 { font-family: "Newsreader", serif; font-size: 22px; line-height: 1.1; margin-bottom: 10px; letter-spacing: -0.01em; }
.pk2 .recipe-page-text p { font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin: 0 0 8px; }
.pk2 .recipe-meta { display: flex; gap: 12px; margin-top: 12px; font-size: 11px; color: var(--ink-mute); }

.pk2 .save-popover { position: absolute; top: 56px; right: 32px; background: #FBF8F1; border-radius: 12px; padding: 16px; width: 240px; box-shadow: 0 24px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #00000010; }
.pk2 .save-popover-head { display: flex; align-items: center; gap: 8px; font-family: "Newsreader", serif; font-size: 14px; font-weight: 500; margin-bottom: 12px; }
.pk2 .save-popover-head .mark { width: 22px; height: 22px; border-radius: 5px; background: var(--green); color: var(--paper-2); display: grid; place-items: center; font-family: "Newsreader", serif; font-style: italic; font-size: 13px; }
.pk2 .save-popover .url-pill { background: #fff; border: 1px solid #00000010; padding: 8px 10px; border-radius: 6px; font-size: 11px; color: var(--ink-mute); margin-bottom: 10px; font-family: "JetBrains Mono", monospace; }
.pk2 .save-popover .save-btn { background: var(--green); color: #FBF8F1; padding: 9px; border-radius: 6px; text-align: center; font-size: 13px; font-weight: 500; cursor: pointer; }
.pk2 .save-popover .saved-tag { margin-top: 8px; font-size: 11px; color: var(--green); display: flex; align-items: center; gap: 6px; }

.pk2 .testimonial { padding: 140px 0; background: var(--paper-2); border-top: 1px solid var(--rule-soft); border-bottom: 1px solid var(--rule-soft); }
.pk2 .quote-mark { font-family: "Newsreader", serif; font-style: italic; font-size: 140px; line-height: 0.6; color: var(--green); margin-bottom: 20px; height: 60px; }
.pk2 .quote-text { font-family: "Newsreader", serif; font-size: clamp(28px, 3.6vw, 48px); line-height: 1.18; letter-spacing: -0.018em; max-width: 22ch; }
.pk2 .quote-text em { font-style: italic; color: var(--green); }
.pk2 .quote-attr { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--rule-soft); display: flex; align-items: center; gap: 16px; max-width: 380px; }
.pk2 .quote-avatar { width: 48px; height: 48px; border-radius: 50%; background: var(--green-soft); overflow: hidden; display: grid; place-items: center; font-family: "Newsreader", serif; font-style: italic; color: var(--green-deep); font-size: 22px; }
.pk2 .quote-attr .name { font-weight: 500; font-size: 15px; }
.pk2 .quote-attr .role { font-size: 13px; color: var(--ink-mute); }
.pk2 .quote-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 80px; align-items: center; }
.pk2 .quote-photo { aspect-ratio: 5/6; border-radius: 4px; overflow: hidden; background: var(--paper-3); }
.pk2 .quote-photo img { width: 100%; height: 100%; object-fit: cover; }

.pk2 .faq-grid { display: grid; grid-template-columns: 0.7fr 1.3fr; gap: 80px; }
.pk2 .faq-list { border-top: 1px solid var(--rule); }
.pk2 details.faq-item { border-bottom: 1px solid var(--rule); padding: 26px 0; }
.pk2 details.faq-item summary { list-style: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 24px; font-family: "Newsreader", serif; font-size: 22px; line-height: 1.25; letter-spacing: -0.012em; }
.pk2 details.faq-item summary::-webkit-details-marker { display: none; }
.pk2 details.faq-item .plus { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--rule); display: grid; place-items: center; flex-shrink: 0; transition: transform .25s ease, background .25s ease; color: var(--ink); }
.pk2 details.faq-item[open] .plus { background: var(--green); color: #FBF8F1; transform: rotate(45deg); border-color: var(--green); }
.pk2 details.faq-item .answer { margin-top: 18px; max-width: 60ch; color: var(--ink-soft); line-height: 1.6; }
.pk2 .faq-num { font-family: "Newsreader", serif; font-style: italic; color: var(--ink-mute); margin-right: 18px; font-size: 18px; }

.pk2 .final-cta { padding: 160px 0; text-align: center; position: relative; }
.pk2 .final-cta .display { font-size: clamp(56px, 8vw, 120px); max-width: 14ch; margin: 0 auto; }
.pk2 .final-cta .lede { margin: 32px auto 40px; text-align: center; font-size: 18px; }
.pk2 .final-cta-cta { display: inline-flex; gap: 14px; align-items: center; }

.pk2 footer { padding: 64px 0 48px; border-top: 1px solid var(--rule); background: var(--paper); }
.pk2 .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; align-items: start; }
.pk2 .footer-grid h5 { font-family: "DM Sans", sans-serif; font-weight: 500; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-mute); margin-bottom: 16px; }
.pk2 .footer-grid ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.pk2 .footer-grid a { color: var(--ink); text-decoration: none; font-size: 14.5px; }
.pk2 .footer-grid a:hover { color: var(--green); }
.pk2 .footer-bottom { margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--rule-soft); display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--ink-mute); }

@media (max-width: 920px) {
  .pk2 .hero-grid { grid-template-columns: 1fr; }
  .pk2 .three-up { grid-template-columns: 1fr; }
  .pk2 .feature-card { border-right: none; border-bottom: 1px solid var(--rule-soft); padding: 36px 0; }
  .pk2 .feature-card:not(:first-child) { padding-left: 0; }
  .pk2 .alt { grid-template-columns: 1fr; gap: 56px; }
  .pk2 .alt.reverse > div:first-child { order: unset; }
  .pk2 .ext-grid { grid-template-columns: 1fr; }
  .pk2 .quote-grid { grid-template-columns: 1fr; }
  .pk2 .faq-grid { grid-template-columns: 1fr; gap: 40px; }
  .pk2 .stats { grid-template-columns: repeat(2, 1fr); }
  .pk2 .footer-grid { grid-template-columns: 1fr 1fr; }
  .pk2 .nav-links { display: none; }
}

/* MOTION SYSTEM */
.pk2 .reveal {
  opacity: 0; transform: translateY(26px);
  transition: opacity 0.9s cubic-bezier(0.22, 1, 0.36, 1), transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--reveal-delay, 0ms);
  will-change: opacity, transform;
}
.pk2 .reveal.is-in { opacity: 1; transform: none; }
.pk2 .reveal-left  { transform: translateX(-30px); }
.pk2 .reveal-right { transform: translateX(30px); }
.pk2 .reveal-scale { transform: translateY(20px) scale(0.985); }
.pk2 .reveal-left.is-in, .pk2 .reveal-right.is-in, .pk2 .reveal-scale.is-in { transform: none; }

.pk2 .img-reveal img, .pk2 .hero-image > img {
  clip-path: inset(0 0 100% 0); transform: scale(1.12);
  transition: clip-path 1.15s cubic-bezier(0.16, 1, 0.3, 1), transform 1.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.pk2 .img-reveal.is-in img, .pk2 .hero-image.is-in > img { clip-path: inset(0 0 0% 0); transform: scale(1.0); }

.pk2 .hero-load {
  opacity: 0; transform: translateY(18px);
  transition: opacity 0.8s ease, transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--load-delay, 0ms);
}
.pk2 .hero-load.is-in { opacity: 1; transform: none; }

.pk2 .photo-card img, .pk2 .quote-photo img, .pk2 .recipe-page-img img { transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1); }
.pk2 .photo-card:hover img, .pk2 .quote-photo:hover img { transform: scale(1.04); }

.pk2 .feature-card { transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1); }
.pk2 .feature-card:hover { transform: translateY(-4px); }
.pk2 .feat-list li.reveal { transition-duration: 0.7s; }

.pk2 .nav { transform: translateY(-100%); transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1); }
.pk2 .nav.nav-in { transform: none; }
.pk2 .hero-image { will-change: transform; }

.pk2 .eyebrow::before { transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1) var(--reveal-delay, 0ms); }
.pk2 .reveal .eyebrow::before, .pk2 .eyebrow.reveal::before { width: 0; }
.pk2 .reveal.is-in .eyebrow::before, .pk2 .eyebrow.reveal.is-in::before { width: 24px; }

@media (prefers-reduced-motion: reduce) {
  .pk2 .reveal, .pk2 .reveal-left, .pk2 .reveal-right, .pk2 .reveal-scale,
  .pk2 .hero-load, .pk2 .img-reveal img, .pk2 .hero-image > img, .pk2 .nav {
    opacity: 1 !important; transform: none !important; clip-path: none !important; transition: none !important;
  }
}
`;

/* ─────────────────────────────────────────────────────────────
   Marketing markup (verbatim from the prototype). Hero phone
   overlay is omitted — the prototype's final config uses the
   single-image hero (heroLayout: "single-image").
   ───────────────────────────────────────────────────────────── */
function bodyHtml() {
  return `
  <nav class="nav">
    <div class="nav-inner">
      <div class="brand">
        <span class="brand-mark">P</span>
        <span>Pie Keeper</span>
      </div>
      <div class="nav-links">
        <a href="#features">Features</a>
        <a href="#extension">Extension</a>
        <a href="#how">How it works</a>
        <a href="#faq">FAQ</a>
      </div>
      <div class="nav-cta">
        <a href="${APP_URL}/login" class="btn btn-ghost">Sign in</a>
        <a href="${APP_URL}/login?signup=true" class="btn btn-primary">Get started</a>
      </div>
    </div>
  </nav>

  <header class="hero">
    <div class="wrap">
      <div class="hero-grid">
        <div>
          <div class="eyebrow mono" style="margin-bottom: 32px;">Recipe library · est. 2024 · Melbourne</div>
          <h1 class="display">
            Every recipe<br/>you've ever<br/>loved, <em>kept.</em>
          </h1>
          <div class="hero-meta">
            <div class="hero-meta-col">
              <p>Pie Keeper grabs any recipe from the web, strips the clutter, and tucks it into one tidy collection — ready when dinner is.</p>
              <div class="hero-cta-row">
                <a href="${APP_URL}/login?signup=true" class="btn btn-primary btn-lg">Get started — it's free</a>
                <a href="#features" class="btn btn-link">See how it works →</a>
              </div>
            </div>
            <div class="hero-meta-col" style="text-align: right;">
              <div class="mono" style="color: var(--ink-mute); margin-bottom: 8px;">No. 01 / The library</div>
              <p style="font-family: 'Newsreader', serif; font-style: italic; font-size: 18px; color: var(--ink); line-height: 1.4;">
                "The cookbook that finally lives where you do — on your phone, in your pocket, in the kitchen."
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="hero-image">
        <img src="/landing/hero.jpg" alt="Hero food photo" />
        <div class="img-caption">
          <span class="mono">Plate 01</span>
          <span class="serif" style="font-size: 17px; font-style: italic;">Saved last Sunday — &ldquo;Roasted tomato pasta&rdquo;</span>
        </div>
      </div>

      <div class="stats-note">
        <span class="eyebrow mono">Fake stats</span>
      </div>

      <div class="stats stats--noted">
        <div class="stat">
          <div class="stat-num"><em>10,200</em></div>
          <div class="stat-label">Recipes saved this week</div>
        </div>
        <div class="stat">
          <div class="stat-num">38<span style="color: var(--ink-mute);">k</span></div>
          <div class="stat-label">Home cooks &amp; counting</div>
        </div>
        <div class="stat">
          <div class="stat-num">4.9<span style="font-size: 28px; color: var(--ink-mute);"> ★</span></div>
          <div class="stat-label">App Store rating</div>
        </div>
        <div class="stat">
          <div class="stat-num">2<span style="font-size: 28px; color: var(--ink-mute);">s</span></div>
          <div class="stat-label">To save a recipe</div>
        </div>
      </div>

      <div class="press">
        <div class="press-label mono">As not featured in</div>
        <div class="press-logos">
          <div class="press-logo italic">Bon Appétit</div>
          <div class="press-logo bold">Eater</div>
          <div class="press-logo upper">The Kitchn</div>
          <div class="press-logo">Serious Eats</div>
          <div class="press-logo script">Food &amp; Wine</div>
        </div>
      </div>
    </div>
  </header>

  <section id="features" class="section-pad">
    <div class="wrap">
      <div style="display: flex; justify-content: space-between; align-items: end; margin-bottom: 64px; gap: 40px; flex-wrap: wrap;">
        <div style="max-width: 22ch;">
          <div class="eyebrow mono" style="margin-bottom: 24px;">What it does</div>
          <h2 class="h-section">A pantry for your <em>recipes.</em></h2>
        </div>
        <p class="lede" style="margin: 0;">Three small habits that fix the recipe chaos — collect, find, and cook from one tidy place.</p>
      </div>

      <div class="three-up">
        <div class="feature-card">
          <div class="feature-num">i.</div>
          <h3 class="feature-title">No more clutter.</h3>
          <p class="feature-body">Save just the recipe — ingredients, steps, and a single photo. No life stories, no ad walls, no "scroll past the wedding album."</p>
          <div class="feature-foot">
            <span class="mono">Avg. 2,400 words → 280</span>
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-num">ii.</div>
          <h3 class="feature-title">Find it instantly.</h3>
          <p class="feature-body">Filter by tag, search by name, or browse the whole shelf at a glance. Your "I had a recipe for that…" moment, solved.</p>
          <div class="feature-foot">
            <span class="mono">200ms search · auto‑tagged</span>
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-num">iii.</div>
          <h3 class="feature-title">Plan your week.</h3>
          <p class="feature-body">Drop recipes onto Tuesday, Wednesday, Friday. Pie Keeper adds up the ingredients and writes you a shopping list.</p>
          <div class="feature-foot">
            <span class="mono">Aisle‑sorted · share‑ready</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section-pad">
    <div class="wrap">
      <div class="alt">
        <div>
          <div class="alt-label">
            <span class="num">01.</span>
            <span class="mono" style="color: var(--ink-mute);">The collect</span>
          </div>
          <h2 class="h-section">Save from <em>anywhere.</em></h2>
          <p class="alt-body">See a recipe you like? One click whisks it into your library. The Chrome extension reads the page, pulls out what matters, and quietly files it away while you keep scrolling.</p>
          <ul class="feat-list">
            <li><span class="k">Chrome extension</span><span class="v">One‑click save</span></li>
            <li><span class="k">AI‑powered parsing</span><span class="v">Reads any blog</span></li>
            <li><span class="k">Auto‑tagging</span><span class="v">Cuisine · meal · time</span></li>
            <li><span class="k">Photo &amp; source kept</span><span class="v">With original link</span></li>
          </ul>
        </div>
        <div class="phone-slot tilt-r">
          <div id="phone-library" class="phone-shadow"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section-pad" style="background: var(--paper-2); border-top: 1px solid var(--rule-soft); border-bottom: 1px solid var(--rule-soft);">
    <div class="wrap">
      <div class="alt reverse">
        <div>
          <div class="alt-label">
            <span class="num">02.</span>
            <span class="mono" style="color: var(--ink-mute);">The cook</span>
          </div>
          <h2 class="h-section">Every detail, <em>beautifully laid out.</em></h2>
          <p class="alt-body">Ingredients on the left, steps on the right, a checkbox for every line. Cooking for six instead of two? Tap the servings — every quantity recalculates with you.</p>
          <ul class="feat-list">
            <li><span class="k">Step‑by‑step view</span><span class="v">Big type, low glare</span></li>
            <li><span class="k">Ingredient checklist</span><span class="v">Tap as you go</span></li>
            <li><span class="k">Adjustable servings</span><span class="v">2 → 8, instantly</span></li>
            <li><span class="k">Notes &amp; ratings</span><span class="v">Per recipe, private</span></li>
          </ul>
        </div>
        <div class="phone-slot tilt-l">
          <div id="phone-recipe" class="phone-shadow"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section-pad">
    <div class="wrap">
      <div class="alt">
        <div>
          <div class="alt-label">
            <span class="num">03.</span>
            <span class="mono" style="color: var(--ink-mute);">The plan</span>
          </div>
          <h2 class="h-section">A week of meals, <em>one tidy list.</em></h2>
          <p class="alt-body">Drag recipes into the days you're cooking. Pie Keeper bundles every ingredient into a single shopping list — sorted by aisle, ready to share, smug enough to make Sunday meal‑prep feel easy.</p>
          <ul class="feat-list">
            <li><span class="k">Weekly planner</span><span class="v">Drag &amp; drop</span></li>
            <li><span class="k">Auto shopping list</span><span class="v">No double‑ups</span></li>
            <li><span class="k">Grouped by aisle</span><span class="v">Produce → pantry</span></li>
            <li><span class="k">Share with family</span><span class="v">SMS or link</span></li>
          </ul>
        </div>
        <div class="phone-slot tilt-r">
          <div id="phone-plan" class="phone-shadow"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section-pad" style="background: var(--paper-2); border-top: 1px solid var(--rule-soft); border-bottom: 1px solid var(--rule-soft);">
    <div class="wrap">
      <div class="alt reverse">
        <div>
          <div class="alt-label">
            <span class="num">04.</span>
            <span class="mono" style="color: var(--ink-mute);">The shelf</span>
          </div>
          <h2 class="h-section">Shelved by <em>occasion.</em></h2>
          <p class="alt-body">Group your recipes into cookbooks — weeknight dinners, party spreads, the bakes you make on repeat. Drag to reorder, or let Pie Keeper suggest new shelves from what you've already saved.</p>
          <ul class="feat-list">
            <li><span class="k">Themed collections</span><span class="v">Your kitchen, your way</span></li>
            <li><span class="k">Drag to reorder</span><span class="v">Favourites up top</span></li>
            <li><span class="k">AI suggestions</span><span class="v">From your library</span></li>
            <li><span class="k">Shared shelves</span><span class="v">Cook together</span></li>
          </ul>
        </div>
        <div class="phone-slot tilt-l">
          <div id="phone-cookbook" class="phone-shadow"></div>
        </div>
      </div>
    </div>
  </section>

  <section id="extension" class="ext-band">
    <div class="wrap">
      <div class="ext-grid">
        <div>
          <div class="eyebrow mono" style="margin-bottom: 24px; color: rgba(251,248,241,0.7);">Chrome extension</div>
          <h2 class="h-section">Save recipes <em>while you browse.</em></h2>
          <p class="lede" style="margin-top: 24px; max-width: 48ch;">Spot a recipe you love? Click the Pie Keeper icon. Done. No copying, no pasting, no juggling tabs — your library quietly grows in the background.</p>
          <div style="display: flex; gap: 14px; margin-top: 36px; flex-wrap: wrap;">
            <a href="https://chromewebstore.google.com/detail/pie-keeper/agohefbmkcgmlpnopjinmmjacmlpffph" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-lg">Add to Chrome — it's free</a>
            <a href="#how" class="btn btn-ghost btn-lg">Watch the demo</a>
          </div>
        </div>
        <div>
          <div class="browser">
            <div class="browser-bar">
              <div class="browser-dots"><span></span><span></span><span></span></div>
              <div class="browser-url">
                <span style="opacity: 0.5;">🔒</span>
                <span>foodblog.com/roasted-tomato-pasta</span>
              </div>
              <div class="brand-mark" style="width: 22px; height: 22px; border-radius: 5px; font-size: 13px;">P</div>
            </div>
            <div class="browser-body">
              <div class="recipe-page">
                <div class="recipe-page-img">
                  <img src="/landing/tomato-pasta.jpg" alt="Recipe photo" />
                </div>
                <div class="recipe-page-text">
                  <h4>Slow‑roasted Tomato Pasta</h4>
                  <p>The kind of recipe my grandmother made on Sunday afternoons, while the windows fogged up and…</p>
                  <p style="opacity: 0.5;">…three more paragraphs about Tuscany…</p>
                  <div class="recipe-meta">
                    <span>45 min</span><span>·</span><span>Serves 4</span><span>·</span><span>★ 4.8</span>
                  </div>
                </div>
              </div>
              <div class="save-popover">
                <div class="save-popover-head">
                  <span class="mark">P</span>
                  <span>Pie Keeper</span>
                </div>
                <div class="url-pill">foodblog.com/roasted…</div>
                <div class="save-btn">Save recipe</div>
                <div class="saved-tag">
                  <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: var(--green); position: relative;"><span style="position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 9px;">✓</span></span>
                  Saved · auto‑tagged "Pasta · Italian"
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="testimonial">
    <div class="wrap">
      <div class="quote-grid">
        <div>
          <div class="quote-mark">&ldquo;</div>
          <p class="quote-text">My favourite recipes were everywhere — bookmarks, screenshots, scraps of paper. Now they're all <em>in one place</em> and I actually <em>cook them again.</em></p>
          <div class="quote-attr">
            <div class="quote-avatar">D</div>
            <div>
              <div class="name">Dafne L.</div>
              <div class="role">Home cook · Melbourne · saving since '24</div>
            </div>
          </div>
        </div>
        <div class="quote-photo">
          <img src="/landing/portrait.jpg" alt="Cook portrait" />
        </div>
      </div>
    </div>
  </section>

  <section id="how" class="section-pad" style="padding-top: 0;">
    <div class="wrap">
      <div class="faq-grid" id="faq">
        <div>
          <div class="eyebrow mono" style="margin-bottom: 24px;">FAQ</div>
          <h2 class="h-section">How to use <em>Pie Keeper.</em></h2>
          <p class="lede" style="margin-top: 24px;">Everything you need to know to get going. Still stuck? <a href="${APP_URL}/login" style="color: var(--ink); border-bottom: 1px solid var(--ink); text-decoration: none;">Drop us a line.</a></p>
        </div>
        <div class="faq-list">
          <details class="faq-item" open>
            <summary><span><span class="faq-num">01</span>How do I install the Chrome extension?</span><span class="plus">+</span></summary>
            <div class="answer">Head to the Chrome Web Store, search "Pie Keeper", and click Add. The little green P will appear in your toolbar — pin it for one‑click saving. Takes about ten seconds.</div>
          </details>
          <details class="faq-item">
            <summary><span><span class="faq-num">02</span>How do I save a recipe from a website?</span><span class="plus">+</span></summary>
            <div class="answer">Click the Pie Keeper icon while you're on the recipe page. We'll parse out the ingredients, steps and photo, and tuck them into your library — auto‑tagged and ready.</div>
          </details>
          <details class="faq-item">
            <summary><span><span class="faq-num">03</span>Can I add a recipe manually?</span><span class="plus">+</span></summary>
            <div class="answer">Yep — type it in, paste it in, or snap a photo of grandma's index card and we'll do our best to read it.</div>
          </details>
          <details class="faq-item">
            <summary><span><span class="faq-num">04</span>How do I add Pie Keeper to my phone's home screen?</span><span class="plus">+</span></summary>
            <div class="answer">iOS &amp; Android apps are in the App Store and Play Store. Or open app.piekeeper.com in Safari and tap "Add to Home Screen".</div>
          </details>
          <details class="faq-item">
            <summary><span><span class="faq-num">05</span>How does the weekly meal planner work?</span><span class="plus">+</span></summary>
            <div class="answer">Drag any recipe onto a day. We'll combine all the ingredients across the week into one shopping list, deduplicated and sorted by aisle.</div>
          </details>
          <details class="faq-item">
            <summary><span><span class="faq-num">06</span>How do I share recipes with family?</span><span class="plus">+</span></summary>
            <div class="answer">Every recipe and shopping list has a share link. Family members on Pie Keeper get a live copy; everyone else gets a beautifully formatted page.</div>
          </details>
          <details class="faq-item">
            <summary><span><span class="faq-num">07</span>What happens if a recipe website goes down?</span><span class="plus">+</span></summary>
            <div class="answer">Doesn't matter — we keep the full text, photos and source link on our servers. Your library is yours, even if the original page disappears.</div>
          </details>
        </div>
      </div>
    </div>
  </section>

  <section class="final-cta" style="background: var(--paper-2); border-top: 1px solid var(--rule-soft);">
    <div class="wrap">
      <div class="eyebrow mono no-rule" style="margin-bottom: 28px; justify-content: center;">— Start your shelf —</div>
      <h2 class="display">Begin your <em>collection.</em></h2>
      <p class="lede">Free to use. No credit card. Your first ten recipes will be waiting in five minutes.</p>
      <div class="final-cta-cta">
        <a href="${APP_URL}/login?signup=true" class="btn btn-primary btn-lg">Get started — it's free</a>
        <a href="#extension" class="btn btn-link">Or grab the Chrome extension →</a>
      </div>
    </div>
  </section>

  <footer>
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <div class="brand" style="margin-bottom: 20px;">
            <span class="brand-mark">P</span>
            <span>Pie Keeper</span>
          </div>
          <p style="color: var(--ink-soft); max-width: 32ch; font-size: 14.5px;">A tidy home for the recipes you actually cook. Built with care in Melbourne.</p>
        </div>
        <div>
          <h5>Product</h5>
          <ul>
            <li><a href="#features">Features</a></li>
            <li><a href="#extension">Chrome extension</a></li>
            <li><a href="#">iOS &amp; Android</a></li>
            <li><a href="#">Pricing</a></li>
          </ul>
        </div>
        <div>
          <h5>Cooks</h5>
          <ul>
            <li><a href="#">Our story</a></li>
            <li><a href="#">Journal</a></li>
            <li><a href="#">Newsletter</a></li>
            <li><a href="#">Contact</a></li>
          </ul>
        </div>
        <div>
          <h5>Legal</h5>
          <ul>
            <li><a href="/privacy">Privacy</a></li>
            <li><a href="#">Terms</a></li>
            <li><a href="#">Cookies</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© 2026 Pie Keeper Pty Ltd · Made in Melbourne 🇦🇺</span>
        <span class="mono">v 2.4 — autumn release</span>
      </div>
    </div>
  </footer>
  `;
}

/* ─────────────────────────────────────────────────────────────
   Motion system (ported from the prototype's inline script, scoped
   to the page root, with teardown for the scroll listener).
   ───────────────────────────────────────────────────────────── */
function runMotion(root: HTMLElement): () => void {
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const cleanups: Array<() => void> = [];

  function tag(sel: string, opts: { variant?: string; base?: number; stagger?: number; mod?: number } = {}) {
    root.querySelectorAll(sel).forEach((el, i) => {
      if (el.closest(".hero")) return;
      el.classList.add("reveal");
      if (opts.variant) el.classList.add(opts.variant);
      const delay = (opts.base || 0) + (opts.stagger ? (i % (opts.mod || 99)) * opts.stagger : 0);
      if (delay) (el as HTMLElement).style.setProperty("--reveal-delay", delay + "ms");
    });
  }

  tag("section .eyebrow", {});
  tag(".h-section", { base: 60 });
  tag("section .lede", { base: 120 });
  tag(".feature-card", { stagger: 120, mod: 3, variant: "reveal-scale" });
  tag(".stat", { stagger: 90, mod: 4 });
  tag(".press-logo", { stagger: 70, mod: 8 });

  root.querySelectorAll(".alt").forEach((alt) => {
    const cols = alt.children;
    const reversed = alt.classList.contains("reverse");
    const textCol = cols[0] as HTMLElement | undefined;
    const mediaCol = cols[1] as HTMLElement | undefined;
    [textCol, mediaCol].forEach((c) => { if (c) c.classList.add("reveal"); });
    if (textCol) textCol.classList.add(reversed ? "reveal-right" : "reveal-left");
    if (mediaCol) { mediaCol.classList.add(reversed ? "reveal-left" : "reveal-right"); mediaCol.style.setProperty("--reveal-delay", "120ms"); }
  });

  root.querySelectorAll(".feat-list").forEach((list) => {
    Array.prototype.forEach.call(list.children, (li: HTMLElement, i: number) => {
      li.classList.add("reveal");
      li.style.setProperty("--reveal-delay", i * 70 + "ms");
    });
  });

  tag(".ext-grid > div", { stagger: 140, mod: 2 });
  tag(".quote-text", { base: 60 });
  tag(".quote-attr", { base: 200 });
  root.querySelectorAll(".quote-photo").forEach((p) => p.classList.add("reveal", "img-reveal"));
  tag(".faq-item", { stagger: 70, mod: 7 });
  tag(".final-cta .eyebrow", {});
  tag(".final-cta .display", { base: 80, variant: "reveal-scale" });
  tag(".final-cta .lede", { base: 200 });
  tag(".final-cta-cta", { base: 300 });
  tag(".footer-grid > div", { stagger: 80, mod: 4 });
  root.querySelectorAll(".photo-card").forEach((p) => p.classList.add("img-reveal"));

  if (reduce) {
    root.querySelectorAll(".reveal, .img-reveal").forEach((el) => el.classList.add("is-in"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    root.querySelectorAll(".reveal, .img-reveal").forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());
  }

  // Hero load sequence
  const heroImg = root.querySelector(".hero-image") as HTMLElement | null;
  const loadBits: Array<[string, number]> = [
    [".hero .eyebrow", 0],
    [".hero h1.display", 140],
    [".hero-meta", 460],
    [".hero-cta-row", 580],
  ];
  const loadEls: HTMLElement[] = [];
  loadBits.forEach(([sel, delay]) => {
    const el = root.querySelector(sel) as HTMLElement | null;
    if (el) { el.classList.add("hero-load"); el.style.setProperty("--load-delay", delay + "ms"); loadEls.push(el); }
  });
  const t1 = window.setTimeout(() => {
    root.querySelector(".nav")?.classList.add("nav-in");
    loadEls.forEach((el) => el.classList.add("is-in"));
    window.setTimeout(() => { heroImg?.classList.add("is-in"); }, 250);
  }, 90);
  cleanups.push(() => window.clearTimeout(t1));

  // Failsafe: never leave content hidden if a hook doesn't fire for any reason
  // (matches the prototype's safety net). Force-reveal everything after a short
  // delay — images use opacity/clip reveals, so this guarantees visibility.
  const failsafe = window.setTimeout(() => {
    root.querySelector(".nav")?.classList.add("nav-in");
    root
      .querySelectorAll(".reveal, .img-reveal, .hero-load, .hero-image")
      .forEach((el) => el.classList.add("is-in"));
  }, 1500);
  cleanups.push(() => window.clearTimeout(failsafe));

  // Hero image parallax
  if (!reduce && heroImg) {
    const hImg = heroImg.querySelector("img") as HTMLElement | null;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const r = heroImg.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) {
          const prog = (window.innerHeight - r.top) / (window.innerHeight + r.height);
          if (hImg) hImg.style.transform = "scale(1.06) translateY(" + prog * -28 + "px)";
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", onScroll));
  }

  // Stat count-up
  if (!reduce) {
    root.querySelectorAll(".stat-num").forEach((node) => {
      const target = (node.querySelector("em") || node) as HTMLElement;
      const txt = (target.textContent || "").trim();
      const m = txt.match(/^([\d,\.]+)/);
      if (!m) return;
      const finalStr = m[1];
      const finalNum = parseFloat(finalStr.replace(/,/g, ""));
      if (!isFinite(finalNum)) return;
      const hasComma = finalStr.indexOf(",") > -1;
      const decimals = (finalStr.split(".")[1] || "").length;
      const suffix = txt.slice(m[1].length);
      let started = false;
      const so = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting || started) return;
            started = true;
            so.disconnect();
            const dur = 1300;
            const t0 = performance.now();
            const step = (now: number) => {
              const p = Math.min((now - t0) / dur, 1);
              const eased = 1 - Math.pow(1 - p, 3);
              const val = finalNum * eased;
              let out = decimals ? val.toFixed(decimals) : Math.round(val).toString();
              if (hasComma) out = Number(out).toLocaleString("en-US");
              target.textContent = out + (target === node ? suffix : "");
              if (p < 1) requestAnimationFrame(step);
              else target.textContent = finalStr + (target === node ? suffix : "");
            };
            requestAnimationFrame(step);
          });
        },
        { threshold: 0.5 }
      );
      so.observe(node);
      cleanups.push(() => so.disconnect());
    });
  }

  return () => cleanups.forEach((fn) => fn());
}

/* Static marketing markup, memoized so React never reconciles (and thus never
   re-applies) the innerHTML after first mount. Without this, any host re-render
   — e.g. React Router reacting to a #hash nav click — re-applies the innerHTML
   and wipes everything the motion script + phone roots added to the DOM. */
const StaticMarkup = memo(function StaticMarkup() {
  return <div dangerouslySetInnerHTML={{ __html: bodyHtml() }} />;
});

/* ─────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────── */
export default function LandingPageV2() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const phones: Array<[string, React.ComponentType]> = [
      ["phone-library", PhoneLibrary],
      ["phone-recipe", PhoneRecipe],
      ["phone-plan", PhonePlan],
      ["phone-cookbook", PhoneCookbook],
    ];
    const roots: Root[] = [];
    const mountedNodes = new WeakSet<Element>();
    let disposed = false;

    // Mount each phone into its placeholder. Idempotent: a given DOM node is
    // only ever given one root, but if a re-render swapped in fresh placeholder
    // nodes (or a slot is still empty), the next pass mounts those. This makes
    // the phones resilient to the host re-rendering after auth state settles.
    function mountPhones() {
      if (disposed || !root) return;
      phones.forEach(([id, El]) => {
        const node = root.querySelector("#" + id);
        if (!node || mountedNodes.has(node) || node.childElementCount > 0) return;
        mountedNodes.add(node);
        const r = createRoot(node);
        r.render(<El />);
        roots.push(r);
      });
    }

    mountPhones();
    // Self-heal passes in case the first mount got clobbered by a re-render.
    const heal1 = window.setTimeout(mountPhones, 400);
    const heal2 = window.setTimeout(mountPhones, 1600);

    let teardownMotion: () => void = () => {};
    try {
      teardownMotion = runMotion(root);
    } catch {
      // If motion setup ever throws, never leave content hidden.
      root
        .querySelectorAll(".reveal, .img-reveal, .hero-load, .hero-image, .nav")
        .forEach((el) => el.classList.add("is-in", "nav-in"));
    }

    return () => {
      disposed = true;
      window.clearTimeout(heal1);
      window.clearTimeout(heal2);
      teardownMotion();
      // Defer unmount so it doesn't run during React's commit phase.
      setTimeout(() => roots.forEach((r) => { try { r.unmount(); } catch { /* node already gone */ } }), 0);
    };
  }, []);

  return (
    <div className="pk2" ref={rootRef}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,600;6..72,700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      />
      <style>{STYLES}</style>
      <StaticMarkup />
    </div>
  );
}
