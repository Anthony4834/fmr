# Hero/Landing Page Design Plan for fmr.fyi

## Implementation Progress

- [x] Create route structure (`app/landing/page.tsx`, `LandingClient.tsx`)
- [x] Create animation hooks (`useCountUp`, `useTypewriter`, `useIntersectionObserver`)
- [x] Build LandingHero section with animated counters + typewriter
- [x] Build LiveDataPreview with ticker + stat cards
- [x] Build MapShowcase with lazy-loaded USStateMap
- [x] Build InvestmentShowcase with ScoreGauge + calculator demo
- [x] Build ExtensionShowcase with browser mockup
- [x] Build FeaturesGrid + FinalCTA sections
- [x] Test build and fix type issues
- [x] Add reduced-motion support

---

## Overview

Create a full marketing landing page with dynamic, engaging animations to convert visitors into users. The page will showcase the platform's key features: interactive US map, live data previews, search demonstration, investment metrics, and Chrome extension.

---

## Route Structure

**Approach**: Create a new `/landing` route

```
/landing     → New marketing landing page (main entry for marketing campaigns)
/            → Current search-focused app (for direct/organic traffic)
```

**Files to create**:
- `app/landing/page.tsx` - Server component with metadata
- `app/landing/LandingClient.tsx` - Main client component orchestrating all sections

---

## Page Sections (Top to Bottom)

### 1. Hero Section (100vh, above the fold)
**Purpose**: Capture attention, establish value proposition

**Content**:
- Logo + "Try Extension" button in nav
- Large headline: "Fair Market Rent Data for Real Estate Investors"
- Three animated rent value counters ($1,847 → $2,156 → $2,890) counting up
- Search input with typewriter placeholder cycling through: "94109", "Austin, TX", "Cook County, IL"
- Subtext: "Find your next cash-flowing market"
- Animated scroll indicator

**Animations**:
- Rent values count up from $0 with staggered timing
- Typewriter effect on search placeholder
- Subtle gradient pulse background (#0a0a0a to #1a1a1a)
- Floating particles with parallax on mouse move

---

### 2. Live Data Preview Section
**Purpose**: Show platform is alive with real data

**Content**:
- Headline: "Markets are moving. Stay ahead."
- Horizontally scrolling ticker: "NYC +5.2% | Austin +8.1% | Miami +3.7%..."
- Three stat cards:
  - "41,784 ZIP Codes Indexed"
  - "$1,892 Median 2BR FMR"
  - "127+ Score Markets"

**Animations**:
- Infinite horizontal scroll ticker (CSS keyframes)
- Stat numbers count up when visible (Intersection Observer)
- Cards fade up staggered on scroll

**Background**: #fafafa (light contrast)

---

### 3. Interactive US Map Section
**Purpose**: Demonstrate core product capability

**Content**:
- Headline: "Explore Investment Scores Nationwide"
- Reuse existing `USStateMap` component (lazy loaded)
- CTA button: "Explore the full map →"

**Animations**:
- Map entrance: fade + scale from 0.95
- Existing hover states preserved

**Background**: #fafafa with white card for map

---

### 4. Investment Metrics Section
**Purpose**: Showcase Investment Score and cash flow calculator

**Content**:
- Headline: "Know Your Numbers Before You Buy"
- Split layout:
  - Left: Animated ScoreGauge showing score of 127
  - Right: Cash flow calculator demo (Rent: $2,156, Expenses: $1,450, Cash Flow: $706)
- CTA: "Learn how Investment Score works →"

**Animations**:
- ScoreGauge fills up when visible
- Calculator values appear sequentially with typewriter effect
- Cash flow number pulses green when revealed

**Background**: #0a0a0a (dark)

---

### 5. Chrome Extension Showcase
**Purpose**: Highlight power-user tool

**Content**:
- Headline: "Analyze Any Listing. Instantly."
- Browser mockup showing Zillow with extension popup overlay
- Feature bullets:
  - See Investment Score on any address
  - One-click cash flow analysis
  - Works on Zillow, Redfin, Realtor.com
- CTA: "Get Chrome Extension →" with Chrome Web Store badge

**Animations**:
- Extension popup slides in from right
- Feature bullets staggered fade-in
- Browser mockup subtle parallax

**Background**: Gradient #0a0a0a to #1a1a1a

---

### 6. Features Grid (2x3)
**Purpose**: Enumerate all capabilities

**Content**:
| FMR Data | SAFMR Precision | 40k+ ZIPs |
| YoY Trends | Investment Scores | Cash Flow |

**Animations**:
- Card hover: scale 1.02, shadow
- Staggered entrance fade-up

**Background**: #fafafa

---

### 7. Final CTA Section
**Purpose**: Convert visitors who scrolled full page

**Content**:
- Headline: "Ready to Find Your Next Investment?"
- Large search input (same as hero)
- Alternative buttons: [Explore Rankings] [View Map] [Get Extension]

**Background**: Gradient #0a0a0a to #1a1a1a

---

## Animation Strategy

**Approach**: CSS + Custom React hooks (no additional dependencies)

**Techniques**:
1. **Number counter**: Custom `useCountUp` hook with `requestAnimationFrame`
2. **Scroll-triggered**: Custom `useIntersectionObserver` hook
3. **Ticker**: Pure CSS `animation: scroll 30s linear infinite`
4. **Typewriter**: `setInterval` character-by-character reveal
5. **Reduced motion**: Respect `prefers-reduced-motion` media query

---

## Color Strategy

**Alternating sections** for visual rhythm:
1. Hero: #0a0a0a (dark)
2. Live Data: #fafafa (light)
3. Map: #fafafa (light)
4. Metrics: #0a0a0a (dark)
5. Extension: gradient #0a0a0a → #1a1a1a
6. Features: #fafafa (light)
7. Final CTA: gradient #0a0a0a → #1a1a1a

**Accent colors** (existing palette):
- Success green: #16a34a, #44e37e
- Data viz blue: #0ea5e9
- Highlight gold: #f59e0b (extension promo)

---

## New Components to Create

```
app/landing/
  page.tsx                      # Server component with metadata
  LandingClient.tsx             # Main orchestrator

app/components/landing/
  LandingHero.tsx               # Hero with animated numbers
  LiveDataPreview.tsx           # Ticker + stat cards
  MapShowcase.tsx               # Lazy-loaded USStateMap wrapper
  InvestmentShowcase.tsx        # ScoreGauge + calculator demo
  ExtensionShowcase.tsx         # Chrome extension promo
  FeaturesGrid.tsx              # 6-feature grid
  FinalCTA.tsx                  # Bottom conversion section

app/hooks/
  useCountUp.ts                 # Animated number counter
  useTypewriter.ts              # Typewriter text effect
  useIntersectionObserver.ts    # Scroll-triggered animations
```

---

## Components to Reuse

| Component | Location | Usage |
|-----------|----------|-------|
| USStateMap | `app/components/USStateMap.tsx` | Map section (lazy load) |
| ScoreGauge | `app/components/ScoreGauge.tsx` | Investment metrics demo |
| SearchInput | `app/components/SearchInput.tsx` | Hero + Final CTA |

---

## Performance Considerations

1. **Map lazy loading**: `dynamic(() => import(...), { ssr: false })`
2. **Below-fold sections**: Defer heavy animations until scrolled into view
3. **GPU acceleration**: Use only `transform` and `opacity` for animations
4. **Image optimization**: `next/image` for any mockups with `priority=false`
5. **Critical path**: Hero renders immediately, map loads after scroll past hero

---

## Implementation Order

1. Create route structure and shell components
2. Implement Hero section with animated counters + typewriter
3. Add Live Data Preview with ticker + stat cards
4. Integrate Map section with lazy loading
5. Build Investment Metrics section reusing ScoreGauge
6. Create Extension Showcase section
7. Add Features Grid + Final CTA
8. Add reduced-motion support
9. Mobile responsive polish
10. Performance optimization pass

---

## Creative Enhancements (Optional)

- **Live Search Preview**: As typewriter types "94109", show mini preview card with actual FMR data
- **Social Proof Ticker**: "47 investors searched Austin, TX in the last hour"
- **Extension Video Loop**: 10-second silent loop showing extension in action
