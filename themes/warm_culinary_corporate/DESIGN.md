---
name: Warm Culinary Corporate
colors:
  surface: '#fff8f1'
  surface-dim: '#dfd9d1'
  surface-bright: '#fff8f1'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f9f3eb'
  surface-container: '#f4ede5'
  surface-container-high: '#eee7df'
  surface-container-highest: '#e8e1da'
  on-surface: '#1e1b17'
  on-surface-variant: '#594137'
  inverse-surface: '#33302b'
  inverse-on-surface: '#f7f0e8'
  outline: '#8d7165'
  outline-variant: '#e1bfb2'
  surface-tint: '#a33e00'
  primary: '#9f3d00'
  on-primary: '#ffffff'
  primary-container: '#c74e00'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb596'
  secondary: '#bc0000'
  on-secondary: '#ffffff'
  secondary-container: '#e51c10'
  on-secondary-container: '#fffbff'
  tertiary: '#785600'
  on-tertiary: '#ffffff'
  tertiary-container: '#986d00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbcd'
  primary-fixed-dim: '#ffb596'
  on-primary-fixed: '#360f00'
  on-primary-fixed-variant: '#7c2e00'
  secondary-fixed: '#ffdad4'
  secondary-fixed-dim: '#ffb4a8'
  on-secondary-fixed: '#410000'
  on-secondary-fixed-variant: '#930000'
  tertiary-fixed: '#ffdea6'
  tertiary-fixed-dim: '#ffbb12'
  on-tertiary-fixed: '#271900'
  on-tertiary-fixed-variant: '#5d4200'
  background: '#fff8f1'
  on-background: '#1e1b17'
  surface-variant: '#e8e1da'
  earth-brown: '#6F4E37'
  text-main: '#2B2D42'
  text-muted: '#8D99AE'
  surface-card: '#FFFFFF'
  border-subtle: '#EEEEEE'
  border-input: '#DDDDDD'
  success: '#2A9D8F'
  danger: '#9D0208'
  primary-hover: '#C44A03'
  danger-hover: '#7A0106'
  row-alt: '#FAF8F5'
  disabled-bg: '#E5E5E5'
  disabled-input-bg: '#F0F0F0'
typography:
  headline-xl:
    fontFamily: Poppins
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.5px
  headline-xl-mobile:
    fontFamily: Poppins
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.3px
  headline-lg:
    fontFamily: Poppins
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 31px
    letterSpacing: -0.25px
  headline-lg-mobile:
    fontFamily: Poppins
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0px
  headline-md:
    fontFamily: Poppins
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 25px
    letterSpacing: 0px
  body-lg:
    fontFamily: Poppins
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: 0px
  body-sm:
    fontFamily: Poppins
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0px
  label-md:
    fontFamily: Poppins
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 15px
    letterSpacing: 0px
  label-sm:
    fontFamily: Poppins
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0px
  input-text:
    fontFamily: Poppins
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 15px
    letterSpacing: 0px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  space-3xl: 4rem
---

## Brand & Style

The design system embodies a corporate, clean, and restrained culinary aesthetic. Built specifically for high-efficiency restaurant operations and table-side ordering, the visual tone avoids superficial ornamentation in favor of purposeful clarity, high-trust stability, and appetite stimulation through warm accents. 

Key attributes:
- **Atmosphere:** Warm, inviting, and professional. The experience blends corporate rigor with hospitality warmth, avoiding the clinical coldness of traditional enterprise software without becoming noisy or informal.
- **Audience:** Restaurant guests navigating the menu at their tables, service staff managing active table calls, and managers operating real-time inventory, sales analytics, and catalog workflows.
- **Visual Style:** Minimalist Corporate with subtle tactile cues. Layouts feature generous whitespace, low-contrast container borders, smooth functional elevations, and pill-shaped semantic status badges.

## Colors

The color palette translates the warmth of food and dining into a disciplined, functional design system.

- **Primary (`#E85D04`):** Vibrant orange representing hunger and energy. Reserved strictly for key action points: active navigational states, primary CTA buttons, and high-priority confirmations.
- **Secondary (`#D00000`):** Tomato red evoking kitchen heat. Used sparingly for secondary visual accents, urgent alerts, and critical indicators.
- **Tertiary (`#FFBA08`):** Mustard yellow providing optimistic contrast. Assigned to pending statuses, warning banners, and featured menu highlights.
- **Neutral (`#FFF8F0`):** Soft cream providing a warm foundation across page bodies, mitigating eye strain in dimly lit dining rooms or bright service counters.
- **Named Surfaces & Texts:** Cards and elevated panels sit on pure `#FFFFFF` with `#EEEEEE` structural borders. Body text relies on `#2B2D42` for WCAG AAA contrast against cream and white surfaces, while `#8D99AE` handles metadata and secondary information.
- **Semantic Colors:** `#2A9D8F` represents success and item availability, while `#9D0208` denotes system errors and sold-out items.

## Typography

The typographic hierarchy relies on **Poppins** across all headings, UI controls, and body copy. 

- **Weight Ceiling:** Typography never exceeds a font-weight of `600` (SemiBold). Heavy or ultra-bold weights are prohibited to preserve an airy, modern, and uncluttered presence.
- **Legibility Guardrails:** Desktop body copy enforces a strict `16px` minimum. In constrained mobile viewports, body text steps down to `14px`.
- **Display Tracking:** Headlines above 20px utilize slight negative letter tracking (`-0.5px` to `-0.25px`) to preserve optical cohesion, whereas labels, inputs, and paragraphs maintain a neutral `0` letter-spacing.

## Layout & Spacing

The layout is anchored on an 8px modular scale, maintaining proportional balance between high data-density dashboards and consumer-facing menu displays.

- **Content Shell:** Application containers enforce a maximum width of `1200px` centered with auto margins on desktop environments.
- **Grid Architecture:** 
  - **Desktop (>=1024px):** 12-column layout with fixed top navigation (64px height), 24px gutters, and 48px page margins.
  - **Tablet (768px - 1023px):** 8-column layout, adaptive side or top navigation, 16px gutters, and 24px lateral margins.
  - **Mobile (<=767px):** Single-column stacked layout with persistent 64px bottom navigation, 16px lateral padding, and full-width edge containers.
- **Vertical Rhythm:** Component groupings and form inputs use `16px` (`space-md`). Internal card paddings use `24px` (`space-lg`). Section transitions enforce `48px` (`space-2xl`) to avoid visual crowding.

## Elevation & Depth

Visual hierarchy is communicated through subtle ambient shadows and low-contrast perimeter borders, keeping the aesthetic grounded and flat rather than simulated in three dimensions.

- **Background Baseline:** `#FFF8F0` defines the primary canvas.
- **Level 1 (Cards & Data Tables):** Pure `#FFFFFF` surfaces with a 1px solid `#EEEEEE` structural line and ambient shadow `0 2px 8px rgba(0, 0, 0, 0.04)`.
- **Level 2 (Hover States & Active Cards):** Elevated panels shift to `0 4px 16px rgba(0, 0, 0, 0.08)` over a 200ms `ease-in-out` transition.
- **Level 3 (Modals, Overlays & Sticky Navbars):** Fixed navigation bars use `#FFF8F0` with a subtle bottom border (`1px solid #EEEEEE`) or a soft drop shadow `0 2px 12px rgba(43, 45, 66, 0.06)`. Modal dialogs sit on white surfaces with `0 12px 32px rgba(43, 45, 66, 0.12)`.

## Shapes

The design system balances structured geometry with friendly, ergonomic corners.

- **Containers & Cards:** Styled with a consistent 12px radius, delivering a clean frame for culinary photography and data widgets without appearing childish.
- **Interactive Controls (Buttons, Text Inputs, Dropdowns):** Standardized on an 8px radius.
- **Status Indicators & Badges:** Use a full pill shape (`999px`), ensuring clear separation from rectangular action triggers.
- **System Modals & Drawers:** Feature 12px corners on desktop, shifting to top-rounded sheets (16px top corners) on mobile views.

## Components

### Buttons
- **Primary:** Solid `#E85D04` background, `#FFF8F0` text, 8px border radius, no border. Padding is 12px vertical by 24px horizontal. Hover transitions to `#C44A03` over 200ms `ease-in-out`.
- **Secondary (Outline):** Transparent background, 1px solid `#E85D04`, text `#E85D04`. Hover fills with `#E85D04` and converts text to `#FFF8F0`.
- **Danger:** Solid `#9D0208` background, `#FFF8F0` text. Hover transitions to `#7A0106`.
- **Disabled:** Solid `#E5E5E5` background, `#8D99AE` text, non-reactive cursor.
- **Touch Target:** Minimum tap area of 44x44px guaranteed across mobile viewports.

### Form Inputs & Selects
- **Base Style:** Background `#FFF8F0`, 1px solid `#DDDDDD` border, 8px border radius, 12px 16px padding, text `#2B2D42` at 15px font size.
- **Focus:** 2px solid `#E85D04`, zero outer glow or browser-native outline.
- **Disabled:** Background `#F0F0F0`, text `#8D99AE`.
- **Labels:** Explicit label tag placed above the input using `#2B2D42`, 13px font size, weight 500.

### Cards (Menu Items & Orders)
- Surface is `#FFFFFF`, border `1px solid #EEEEEE`, border radius 12px, internal padding 24px, base shadow `0 2px 8px rgba(0, 0, 0, 0.04)`.
- **Interactive Cards (Menu):** Hover state elevates shadow to `0 4px 16px rgba(0, 0, 0, 0.08)` with a subtle image zoom or border shift.
- **Sold Out / Inactive Items:** Reduced opacity (0.6), desaturated thumbnail presentation, interactive inputs disabled, and a prominent danger badge overlay.

### Badges & Status Chips
- Pill silhouette (`border-radius: 999px`), padding 4px 12px, font size 13px, weight 500.
- **Available:** Background `#2A9D8F`, text `#FFFFFF`.
- **Unavailable / Error:** Background `#9D0208`, text `#FFFFFF`.
- **Pending / In Progress:** Background `#FFBA08`, text `#2B2D42`.

### Data Tables (Inventory, Staff, Orders)
- **Header:** Background `#FFF8F0`, text `#2B2D42`, font weight 500, padding 12px 16px.
- **Rows:** Alternating rows using `#FFFFFF` and `#FAF8F5`.
- **Borders:** Horizontal only (`1px solid #EEEEEE`), no vertical grid dividers.

### Modal Dialogs (Service Calls & Confirmation)
- Backdrop blur with `rgba(43, 45, 66, 0.4)` scrim.
- Centered `#FFFFFF` card, 12px radius, 32px padding, explicit close icon (`#8D99AE` 20px) positioned top-right.

### Audio Activation Notification
- In-banner contextual prompt for audio permissions: cream card with `#FFBA08` left indicator bar, text `#2B2D42`, and inline secondary button to trigger browser audio policies.