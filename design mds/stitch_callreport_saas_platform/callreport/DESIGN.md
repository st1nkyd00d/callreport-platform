---
name: CallReport
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#454652'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#757684'
  outline-variant: '#c5c5d4'
  surface-tint: '#4355b9'
  primary: '#24389c'
  on-primary: '#ffffff'
  primary-container: '#3f51b5'
  on-primary-container: '#cacfff'
  inverse-primary: '#bac3ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#603b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#805000'
  on-tertiary-container: '#ffc988'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dee0ff'
  primary-fixed-dim: '#bac3ff'
  on-primary-fixed: '#00105c'
  on-primary-fixed-variant: '#293ca0'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-max: 1440px
  gutter: 16px
  sidebar-width: 260px
---

## Brand & Style

The design system for CallReport is built on the principles of **Operational Precision** and **Institutional Trust**. As a B2B SaaS platform for call center management, the interface prioritizes high-utility workflows and data density over decorative elements. 

The aesthetic follows a **Corporate / Modern** style: a systematic, balanced approach that utilizes structured layouts and a refined color palette to reduce cognitive load during long work shifts. The goal is to evoke a sense of reliability and efficiency, ensuring that supervisors and agents can process complex metrics and call logs with absolute clarity. The emotional response is one of professional calm and control.

## Colors

This design system utilizes a structured palette designed for high-density information environments.

- **Primary (Indigo):** Used for primary actions, active navigation states, and brand-related components. It conveys authority and technical stability.
- **Success (Green):** Specifically reserved for positive outcomes such as "Venta completada" or "Resolución exitosa."
- **Warning (Amber):** Used for "Tareas pendientes" or "Seguimiento requerido." It signals attention without the urgency of an error.
- **Danger (Red):** Dedicated to critical errors, missed calls, or destructive actions like "Eliminar registro."
- **Neutral (Gray):** A range of cool grays used for typography, borders, and surface backgrounds to create a clean, professional hierarchy.

The default mode is **Light**, utilizing a subtly tinted white (`#F8FAFC`) for background surfaces to reduce eye strain.

## Typography

The design system utilizes **Inter** for its exceptional legibility at small sizes and high-density UI. 

- **Headlines:** Use Bold (700) or SemiBold (600) weights with tighter letter spacing for a modern, compact feel.
- **Body Text:** Standardized at 14px for the majority of data-driven views to maximize information per screen.
- **Labels:** Use SemiBold weight. `label-sm` is employed for table headers and secondary metadata, often in uppercase to provide clear visual distinction from data.
- **Localization:** All typography must accommodate Spanish character lengths (e.g., "Confirmar" vs "OK"), ensuring containers have sufficient horizontal flexibility.

## Layout & Spacing

This design system follows a **Fixed-Fluid hybrid grid** model:

- **Desktop:** Features a fixed-width left sidebar (260px) and a fluid main content area. Data tables and KPI grids utilize a 12-column system with 16px gutters. Margins are fixed at 32px for enterprise clarity.
- **Mobile:** Uses a single-column fluid layout with 16px horizontal safe-area margins.
- **Density:** Spacing is tighter than standard consumer apps to allow for "at-a-glance" monitoring. Use `8px` (sm) for internal component spacing and `16px` (md) for grouping related elements.
- **Breakpoints:** 
    - Mobile: < 768px
    - Tablet: 768px - 1024px
    - Desktop: > 1024px

## Elevation & Depth

To maintain a professional, utilitarian aesthetic, depth is conveyed primarily through **Tonal Layers** and **Low-Contrast Outlines**:

- **Level 0 (Background):** `#F8FAFC` (Cool Gray 50).
- **Level 1 (Cards/Tables):** Pure white background with a 1px border in `#E2E8F0`. This is the primary surface for data.
- **Level 2 (Popovers/Modals):** Pure white with a soft, neutral shadow (`0px 4px 12px rgba(0, 0, 0, 0.05)`).
- **Slide-overs:** On the Web, use right-aligned panels for "Detalle de llamada" (Call details) to keep the context of the main data table visible underneath. Use a 20% opacity neutral overlay.

## Shapes

The design system uses a **Soft (1)** roundedness level to maintain a professional, efficient tone. 

- **Standard Elements:** 4px (`0.25rem`) radius for buttons, input fields, and small cards. This keeps the UI feeling precise and organized.
- **Large Containers:** 8px (`0.5rem`) for main content modules and KPI cards.
- **Status Pills:** Fully rounded (pill-shaped) to distinguish them from interactive buttons.

## Components

- **Buttons:** 
    - *Primary:* Indigo background with white text. High-contrast. 
    - *Secondary:* White background with 1px gray border.
    - *Labels:* "Guardar Cambios," "Nueva Llamada."
- **Navigation:**
    - *Web:* Left sidebar with icons (Outlined style) and labels. Active state uses a light indigo tint (`#EEF2FF`) and a 3px primary-color left border.
    - *Mobile:* Bottom tab bar with 4-5 key sections: "Dashboard," "Llamadas," "Tareas," "Perfil."
- **Data Tables (Web):** High-density. Row height of 48px. Use alternating row stripes or subtle borders. Fixed headers during scroll.
- **KPI Cards:** Prominent numerical values (`headline-lg`) with a small trend indicator (e.g., "+12% vs ayer").
- **Status Pills (Píldoras de Estado):**
    - *Completado:* Green background (10% opacity) with Green text.
    - *Pendiente:* Amber background (10% opacity) with Amber text.
    - *Error:* Red background (10% opacity) with Red text.
- **Input Fields:** 1px border. Focus state uses a 2px primary indigo outline with 0.2s transition. Include clear Spanish placeholder text (e.g., "Buscar por agente...").