# design.md — Descripción del proyecto optimizada para Stitch AI

## Cómo usar este archivo (nota en español)

[Stitch](https://stitch.withgoogle.com) genera mejores resultados con **prompts en inglés, una pantalla por prompt**. Este archivo está organizado así:

1. **Project Context** — pégalo al inicio de la sesión de Stitch (o como primer prompt) para fijar el contexto y el sistema de diseño.
2. **Screen Prompts** — un prompt por pantalla, listos para copiar y pegar uno a la vez. Genera primero las pantallas móviles (selecciona *Mobile* en Stitch) y luego las del panel web (selecciona *Web*).
3. Mantén la misma sesión/proyecto en Stitch para que conserve la consistencia visual entre pantallas.

Los textos visibles de la interfaz (labels, botones) están indicados **en español** dentro de los prompts, porque la app final es en español — Stitch respetará esos textos aunque el prompt esté en inglés.

---

## 1. Project Context (paste first)

```
I'm designing "CallReport", a B2B SaaS platform for a call center company that answers
phone calls on behalf of its client companies. There are two surfaces:

1. A MOBILE APP (Android/iOS) used by two roles:
   - AGENTS: call center employees who manually fill out a report after each call
     (contact info, call outcome, notes). Their flow must be extremely fast and
     low-friction: pick a campaign once, then fill and submit reports repeatedly.
   - CLIENT USERS: employees of the client companies. They watch a private, real-time
     dashboard of the call reports created for their company, filter them, review
     pending follow-ups, and export data. They must feel their data is exclusive
     and secure (strict tenant isolation).

2. A WEB ADMIN PANEL used by the call center owner and supervisors to manage client
   companies (tenants), campaigns, call dispositions, users, agent assignments,
   productivity metrics, and audit logs.

DESIGN SYSTEM:
- Tone: professional, trustworthy, operational. This is a work tool used many hours
  a day — prioritize clarity, density and legibility over decoration.
- Style: clean modern SaaS. Generous white space in mobile, comfortable density in web.
- Primary color: deep indigo (#3F51B5 range). Success: green. Warning/follow-up: amber.
  Danger: red. Neutral grays for surfaces. Support light mode (default).
- Typography: modern grotesque sans-serif (like Inter). Clear hierarchy with size and
  weight, not color.
- All UI copy is in SPANISH. I will specify the exact Spanish labels per screen.
- Mobile: bottom tab navigation. Web: left sidebar navigation.
```

---

## 2. Screen Prompts — Mobile App (select "Mobile" in Stitch)

### 2.1 Login (shared by all roles)

```
Mobile login screen for "CallReport". Centered layout: app logo (a simple headset icon
in deep indigo) and app name "CallReport", subtitle "Reportes de llamadas en tiempo real".
Form: email field labeled "Correo electrónico", password field labeled "Contraseña" with
show/hide toggle, primary button "Iniciar sesión" (full-width, indigo). Below: subtle
link "¿Olvidaste tu contraseña?". Professional, minimal, trustworthy. No sign-up option
(accounts are created by the administrator).
```

### 2.2 Agent — Campaign selector

```
Mobile screen: campaign picker for a call center agent, shown after login. Header:
"Selecciona tu campaña" with subtitle "Los reportes que crees se asignarán a esta
campaña". Vertical list of campaign cards; each card shows: client company name in bold
(e.g. "Acme Corp"), campaign name below (e.g. "Ventas Q3"), and a small badge with the
number of reports the agent filed today (e.g. "12 hoy"). The currently selected campaign
has an indigo border and a check icon. Bottom tab bar with 3 tabs: "Reportar" (edit/pencil
icon, active), "Mis reportes" (list icon), "Perfil" (user icon).
```

### 2.3 Agent — New call report form (core screen, highest usage)

```
Mobile screen: call report entry form for a call center agent. This is the most-used
screen of the app — optimize for speed and one-handed use. Top bar shows the active
campaign as a compact chip: "Acme Corp — Ventas Q3" with a change (swap) icon.
Form sections:
1. "Datos del contacto": fields "Nombre" (text), "Teléfono" (phone), "Correo (opcional)".
2. "Tipificación": a group of large selectable chips loaded from the campaign, e.g.
   "Venta Completada", "Consulta Resuelta", "Seguimiento Pendiente", "No Interesado".
   One selected at a time; the follow-up one shows a small amber clock icon.
3. "Notas de la llamada": multiline text area with placeholder "Detalles de la
   interacción...".
Sticky bottom primary button: "Guardar reporte". Show a subtle inline validation error
example under the phone field: "Ingresa un teléfono válido". Same bottom tab bar as
before with "Reportar" active.
```

### 2.4 Agent — My reports today

```
Mobile screen: "Mis reportes" list for a call center agent. Header "Mis reportes" with
a segmented control "Hoy | Esta semana". Summary row of small stat chips: "18 reportes",
"3 seguimientos". Below, a chronological list of report cards; each card shows: time
(e.g. "14:32"), contact name in bold, campaign chip, disposition as a colored pill
(green for "Venta Completada", amber for "Seguimiento Pendiente", gray for
"No Interesado"). Reports still editable show a small outlined button "Editar" with a
countdown caption "23 min restantes"; older ones show a lock icon with caption "Solo
supervisor". Bottom tab bar with "Mis reportes" active.
```

### 2.5 Client — Real-time dashboard (flagship screen)

```
Mobile screen: real-time call reports dashboard for a client company user of a call
center service. Header: company name "Acme Corp" with a live status indicator (green
dot + "En vivo"). Filter row: date-range chips "Hoy | Semana | Mes | Personalizado" and
a filter icon for disposition filtering. Summary cards in a 2x2 grid: "Total llamadas
47", "Ventas 12" (green accent), "Seguimientos 5" (amber accent), "No interesados 9".
Below, a live feed list titled "Reportes recientes": each row shows time, contact name,
campaign name, and a colored disposition pill. The newest row at the top has a subtle
highlight animation state (light indigo background fading) to convey it just arrived in
real time. Bottom tab bar with 4 tabs: "Dashboard" (active), "Seguimientos" with a badge
"5", "Exportar", "Perfil".
```

### 2.6 Client — Report detail

```
Mobile screen: call report detail view for a client company user. Presented as a full
screen with back arrow, title "Detalle del reporte". Content in cards:
1. Contact card: name "María González" large, phone and email rows with icons and
   tap-to-call / tap-to-email affordances.
2. Call card: disposition pill "Seguimiento Pendiente" (amber), campaign "Ventas Q3",
   date and time "18 jul 2026, 14:32", agent name "Atendió: Carlos R.".
3. Notes card titled "Notas de la llamada" with a paragraph of text.
If the report is a pending follow-up, show a prominent amber button at the bottom:
"Marcar seguimiento como resuelto".
```

### 2.7 Client — Follow-ups queue

```
Mobile screen: pending follow-ups queue for a client company user. Header "Seguimientos"
with segmented control "Pendientes (5) | Resueltos". List of follow-up cards: contact
name bold, phone, campaign chip, relative time "hace 2 horas", and a trailing circular
check button to resolve. One card shown mid-swipe revealing a green "Resolver" action.
Resolved tab items (not visible here) would show who resolved them and when. Empty-state
concept not needed. Bottom tab bar with "Seguimientos" active showing badge "5".
```

### 2.8 Client — Export

```
Mobile screen: data export screen for a client company user. Header "Exportar reportes".
Card with export configuration: date range selector rows "Desde" and "Hasta" with
calendar icons, a dropdown "Tipificación: Todas", and a summary line "47 reportes en el
rango seleccionado". Two large option cards side by side: "CSV / Excel" with a
spreadsheet icon and caption "Listado completo de llamadas", and "PDF" with a document
icon and caption "Resumen ejecutivo". Primary button "Descargar y compartir" that
implies the system share sheet. Bottom tab bar with "Exportar" active.
```

---

## 3. Screen Prompts — Web Admin Panel (select "Web" in Stitch)

### 3.1 Admin — Metrics dashboard (home)

```
Web dashboard for the owner of a call center company, desktop layout. Left sidebar
navigation with logo "CallReport" and items: "Métricas" (active), "Clientes",
"Campañas", "Usuarios", "Auditoría". Top bar with date range picker "Últimos 30 días"
and the admin's avatar. Main content:
- Row of 4 KPI stat cards: "Reportes totales 1,248", "Promedio por agente/hora 6.2",
  "Seguimientos pendientes 23" (amber), "Clientes activos 8".
- Two charts side by side: a bar chart "Reportes por agente" comparing ~6 agents, and a
  line chart "Volumen diario" over 30 days.
- Below: a donut chart "Distribución de tipificaciones" next to a compact table
  "Productividad por agente" with columns: Agente, Reportes, Prom./hora, Ventas,
  Seguimientos.
Clean professional SaaS style, indigo accents, light mode.
```

### 3.2 Admin — Tenants (client companies) management

```
Web admin screen: client companies management ("Clientes") for a call center platform.
Same left sidebar, "Clientes" active. Header row: title "Empresas cliente", search input
"Buscar empresa...", primary button "+ Nueva empresa". Data table with columns: Empresa,
Estado (pill "Activa" green / "Suspendida" gray), Campañas (count), Usuarios (count),
Reportes este mes, and a row actions menu (edit / suspend). A slide-over panel on the
right is open showing the "Nueva empresa" form: fields "Nombre de la empresa", "Ventana
de edición de reportes (minutos)" with default value 30, and toggle "Activa". Buttons
"Guardar" (indigo) and "Cancelar".
```

### 3.3 Admin — Campaign detail with dispositions and agent assignment

```
Web admin screen: campaign configuration page for a call center platform. Left sidebar
with "Campañas" active. Breadcrumb "Campañas / Acme Corp / Ventas Q3". Page header:
campaign name "Ventas Q3" with client chip "Acme Corp" and status toggle "Activa".
Two tabs: "Tipificaciones" (active) and "Agentes asignados".
Tipificaciones tab: sortable list of disposition rows, each with a drag handle, label
("Venta Completada", "Consulta Resuelta", "Seguimiento Pendiente", "No Interesado"),
a toggle "Requiere seguimiento" (on only for "Seguimiento Pendiente", amber), an active
toggle, and edit icon. Button "+ Agregar tipificación" below.
Agentes tab (shown as secondary): would list agents with checkboxes.
```

### 3.4 Admin — Users management

```
Web admin screen: users management ("Usuarios") for a call center platform. Left sidebar,
"Usuarios" active. Header: title "Usuarios", filter chips by role "Todos | Agentes |
Supervisores | Usuarios cliente", search, and primary button "+ Nuevo usuario". Data
table columns: Nombre, Correo, Rol (pill: "Agente" indigo, "Supervisor" purple, "Cliente"
teal), Empresa (only for client users, e.g. "Acme Corp"), Estado, Último acceso, actions
menu (edit / reset password / deactivate). Show 8-10 varied rows.
```

### 3.5 Admin — Audit log viewer

```
Web admin screen: immutable audit log viewer ("Auditoría") for a call center platform.
Left sidebar, "Auditoría" active. Header: title "Registro de auditoría" with subtitle
"Registro inmutable de todas las acciones del sistema", filters row: date range picker,
dropdown "Usuario: Todos", dropdown "Acción: Todas". Dense read-only table with columns:
Fecha y hora, Usuario, Acción (pill: "Creación" green, "Modificación" amber,
"Resolución" blue), Entidad (e.g. "Reporte #4821"), Dirección IP. One row expanded
inline showing a small before/after diff of changed fields ("Teléfono: 555-0134 →
555-0143"). Pagination footer. No edit or delete controls anywhere — strictly read-only.
```

---

## 4. Consejos finales para la sesión de Stitch (español)

- Genera las pantallas en el orden listado: las primeras fijan el estilo que las demás heredan.
- Si una pantalla sale desalineada con el resto, re-génerala añadiendo al final del prompt: `Match the visual style, colors and typography of the previous screens in this project.`
- Para variantes (estado vacío, modo error), pide sobre la pantalla ya generada: `Show this same screen with an empty state: no reports yet, with the Spanish message "Aún no hay reportes hoy".`
- Exporta a Figma desde Stitch para refinar antes de implementar en React Native / React.
