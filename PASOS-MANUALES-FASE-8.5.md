# Pasos manuales pendientes — Fase 8.5

Checklist de ejecución de la Fase 8.5 (ver `plan.md`). Mismo formato que
`PASOS-MANUALES-FASE-8.md`: cada bloque tiene el código ya listo del lado del
repo; lo que falta son cuentas/hardware que solo vos podés operar. Marcar cada
paso con el resultado observado, no solo el tilde — así queda registrado qué
se probó de verdad.

---

## A. Banco de pruebas en la PC — ✅ HECHO (2026-08-29)

- [x] `cmdline-tools` no venía instalado con el SDK (solo `platform-tools`/
      `emulator`/imágenes) -- se bajó el zip oficial
      (`commandlinetools-win-*_latest.zip` desde `dl.google.com`, no
      `edgedl.me.gvt1.com`, que devuelve 404 para este paquete) y se
      extrajo a `Sdk/cmdline-tools/latest/`.
- [x] `adb`/`emulator`/`avdmanager`/`sdkmanager` agregados al **PATH de
      usuario** de Windows (persistente, no hace falta re-setearlo en
      cada terminal nueva -- sí hace falta abrir una terminal nueva para
      que lo herede).
- [x] AVD creado: `Pixel_CallReport`, imagen
      `system-images;android-35;google_apis_playstore;x86_64` (la única
      variante Play Store instalada es android-35, no 34).
      **Bug real encontrado**: `avdmanager` (versión 22.0 de este
      cmdline-tools) no pudo cargar `devices.xml` (no existe en ningún
      lado del SDK ni de Android Studio en esta máquina) y creó el AVD
      con un `config.ini` de fallback totalmente roto -- pantalla
      320x640 @ 160dpi, `PlayStore.enabled=no`, `hw.ramSize=2G`,
      `avd.id`/`avd.name` literalmente `<build>` sin sustituir, sin
      `hw.device.name`. Pasa **con o sin** el flag `-d pixel_6`. Se
      corrigió a mano editando `~/.android/avd/Pixel_CallReport.avd/config.ini`
      con las specs reales de un Pixel 6 (1080x2400 @ 420dpi, RAM 4096M,
      `PlayStore.enabled=yes`, `hw.gpu.enabled=yes`, skin `pixel_6`). Si
      se crea otro AVD en el futuro con este mismo `avdmanager`, esperar
      el mismo bug y aplicar el mismo fix manual -- no es un problema de
      esta AVD en particular, es la herramienta.
- [x] Boot verificado headless (`emulator -no-window -gpu swiftshader_indirect`):
      Android 15, `sys.boot_completed=1`, `com.android.vending` +
      `com.google.android.gms` presentes (Play Store funcional). Emulador
      apagado después de verificar -- levantarlo de nuevo con
      `emulator -avd Pixel_CallReport` (sin `-no-window`) para usarlo de
      verdad.
- [x] App real corrida en el emulador (`npx expo start --android`, Expo Go
      auto-instalado): **encontró y arregló 2 bugs reales que bloqueaban
      la app entera en Android**, ver la tabla de la sección E. Con los
      fixes, el login (agente), "Elegir campaña", "Turno" (datos reales:
      turno abierto, contador, "2 reportes en este turno") y "Mis
      reportes" cargan sin errores. `npx expo lint` y `npx tsc --noEmit`
      limpios después de los fixes.
      **Bug cosmético encontrado, sin arreglar todavía** (no bloquea
      nada, es una decisión de diseño pendiente): ninguna de las dos
      barras de tabs (`(agent)/_layout.tsx`, `(client)/_layout.tsx`)
      define `tabBarIcon` -- `@expo/vector-icons` ni siquiera está
      instalado. Hoy cada tab muestra un cuadrado vacío en vez de un
      ícono. Que decida el usuario qué set de íconos usar antes de
      cerrar la fase.
      El API local (`npm run dev:api`) y Metro (`npx expo start`, puerto
      8081) quedaron corriendo en background al terminar esta sesión --
      podés seguir probando ahí mismo, o levantar tu propia terminal con
      `npm run dev:api`/`npm run dev:mobile` si ya no están.
- [ ] `admin-web` local (`http://localhost:5173`) abre y loguea con clicks
      reales (no solo `curl`) -- **pendiente, no se llegó a probar en
      esta sesión** (todo el tiempo se fue en destrabar la app móvil).

## B. Identidad, EAS y Firebase

- [ ] `npx eas login` (cuenta de Expo, crear una gratis si no tenés).
- [ ] `npx eas init` desde `apps/mobile/` — confirma que llena
      `extra.eas.projectId` en `app.json` (hoy vacío).
- [ ] Firebase: [console.firebase.google.com](https://console.firebase.google.com)
      → crear proyecto → **Agregar app → Android** con package
      `com.callreport.app` → descargar `google-services.json` → guardarlo en
      `apps/mobile/google-services.json` (ya referenciado en `app.json`, se
      commitea sin problema).
- [ ] En el mismo proyecto de Firebase: **Configuración del proyecto → Cuentas
      de servicio → Generar nueva clave privada** → guardar el JSON en un
      lugar fuera del repo (o dentro de `apps/mobile/` con el patrón
      `*service-account*.json`/`*firebase-adminsdk*.json`, ya excluido en
      `.gitignore` — **nunca commitear este archivo**, es la clave real).
- [ ] Subir esa clave a EAS: `npx eas credentials` (desde `apps/mobile/`) →
      Android → seleccionar el perfil → **Google Service Account** → apuntar
      al JSON del paso anterior.
- [ ] Redeploy de `callreport-api` en Render (Manual Deploy → Deploy latest
      commit) para que tome `PUSH_ENABLED=true` de `render.yaml` (ya
      cambiado en el repo).

## C. Build descargable

- [ ] Desde `apps/mobile/`: `npx eas build -p android --profile preview`.
      Cola gratuita ~10-20 min. Al terminar da un link + QR de descarga.
- [ ] Descargar el APK en el/los Android físicos e instalar (Android va a
      pedir permitir "instalar apps de origen desconocido" la primera vez).
- [ ] Con el APK recién instalado: abrir la app, esperar el cold start de
      Render si estaba dormido (~50 s en el primer request), y loguear con
      cada uno de los 3 roles (`Password123!`, ver `README.md`).
- [ ] iPhone: `npx expo start` en la PC, escanear el QR con la cámara/Expo Go.
      Si querés que apunte a Render en vez de al bundler local, crear
      `apps/mobile/.env` con `EXPO_PUBLIC_API_URL=https://callreport-api.onrender.com`
      (ver `.env.example`) y reiniciar `expo start`.

## D. Matriz de verificación manual

Antes de arrancar: `SMOKE_BASE_URL=https://callreport-api.onrender.com node apps/api/scripts/smoke-deploy.mjs`
en verde (confirma que la base de producción responde y tiene los 3 roles).

1. [ ] **Login + persistencia de sesión** (Fases 1-2) — login como agente,
       supervisor y client_user; matar la app (no solo minimizar) y
       reabrirla mantiene la sesión sin volver a pedir login.
       Resultado observado: _______________________________________

2. [ ] **Flujo del agente <30s** (Fase 4) — seleccionar campaña → llenar
       formulario → guardar → aparece en "Mis reportes". Cronometrar desde
       el primer tap hasta que el reporte aparece en la lista.
       Resultado observado: _______________________________________

3. [ ] **Modo avión / cola offline** (Fase 4) — activar modo avión, guardar
       un reporte (queda en cola visible), desactivar modo avión, confirmar
       que el reintento automático lo envía y desaparece de la cola.
       Resultado observado: _______________________________________

4. [ ] **Tiempo real entre tenants** (Fase 5) — agente crea un reporte para
       una campaña de un tenant; el dashboard del cliente de ESE tenant
       (otra sesión, otro dispositivo) lo muestra en <2s sin recargar; un
       cliente logueado de OTRO tenant no recibe nada. Nota: si Render
       estaba dormido, hacer un request cualquiera primero para
       "despertarlo" antes de cronometrar.
       Resultado observado: _______________________________________

5. [ ] **Resync tras background** (Fase 5) — con la app del cliente en
       background, crear 3 reportes desde el agente; al volver a primer
       plano, los 3 aparecen.
       Resultado observado: _______________________________________

6. [ ] **Push remoto real** (Fase 6) — con la app del cliente CERRADA (no
       en background), crear un reporte; la notificación llega en
       segundos y tocarla abre el detalle correcto (deep link). Repetir
       con una tipificación `requiresFollowup=true` y confirmar que
       también le llega al supervisor. Probar en Android (APK) y en
       iPhone (Expo Go).
       Resultado observado: _______________________________________

7. [ ] **Seguimientos** (Fase 6) — el badge de pendientes se ve, resolver
       uno lo mueve a "Resueltos" con quién/cuándo, y otra sesión conectada
       ve el cambio en tiempo real sin refrescar.
       Resultado observado: _______________________________________

8. [ ] **Exportar CSV/PDF** (Fase 7) — desde el dashboard del cliente,
       exportar CSV y PDF, compartir vía el share sheet del sistema, y
       abrir el archivo resultante (verificar acentos y que refleje los
       filtros aplicados). Repetir en Android e iPhone.
       Resultado observado: _______________________________________

9. [ ] **`admin-web` con clicks reales** (Fases 3, 6, 7) — CRUD completo
       (tenant → campaña → 3 tipificaciones → 2 agentes asignados →
       client_user), página de Métricas con selector de rango, visor de
       Auditoría con filtros, exportar CSV/PDF de un tenant. Probar contra
       `http://localhost:5173` (API local) y contra
       `https://callreport-admin.onrender.com` (API de Render).
       Resultado observado: _______________________________________

## E. Bugs encontrados durante la matriz

(completar a medida que aparezcan, con el número de paso que lo destapó)

| # paso | Bug | Fix (commit) |
|---|---|---|
| A (banco de pruebas) | **Crítico**: la app entera no arrancaba en Android real/Expo Go (probado con `expo start --android` en el emulador, no en headless) -- pantalla en negro / "Uncaught Error", ninguna ruta definía su export default. Causa raíz: `apps/mobile/src/lib/push.ts` hacía `Notifications.setNotificationHandler(...)` a nivel de módulo con un `import * as Notifications from 'expo-notifications'` estático; ese import se resuelve (hoisted) ANTES que cualquier código propio, y en Android/Expo Go SDK 53+ el módulo `expo-notifications` tira una excepción con solo importarlo (un side-effect interno de `AutoRegistration.fx.js` llama `addPushTokenListener()` al cargar, que en Expo Go hace `throw`). Como `push.ts` se importa desde el `_layout` raíz (vía `usePushRegistration`), tumbaba la evaluación de TODA la app. | Pendiente de commit -- `push.ts` reescrito: `expo-notifications` se carga con `import()` dinámico y memoizado, y antes de intentarlo se chequea `Constants.appOwnership === 'expo'` (Expo Go) para no tocar el módulo en absoluto ahí. `use-notification-deep-link.ts` reescrito para reusar ese mismo loader (exportado desde `push.ts`) en vez de su propio import estático, y reemplaza el hook empaquetado `useLastNotificationResponse()` por su equivalente manual (`getLastNotificationResponseAsync()` dentro de un efecto) porque un hook no se puede cargar de forma perezosa sin violar las Rules of Hooks. |
| A (banco de pruebas) | Crash nativo `SIGSEGV` en `libworklets.so` (tid `mqt_v_js`, fault addr 0x0) apenas la app intentaba cargar en Expo Go/Android -- reproducible 3/3 veces, tombstone confirmado. Causa: 17 paquetes desalineados con el SDK 57 instalado (`react-native-worklets@0.10.0` vs `0.10.1` esperado, `react-native-reanimated@4.5.0` vs `4.5.1`, `expo@57.0.7` vs `~57.0.18`, y otros 14 -- `npx expo install --check` lo confirmó). El cliente de Expo Go que se descarga siempre trae los binarios nativos de la versión MÁS RECIENTE del SDK, así que un `package.json` desalineado revienta en runtime aunque `tsc`/`lint` no vean nada raro. | `npx expo install --fix` (actualiza los 17 paquetes a la versión exacta que espera SDK 57). Pendiente de commit -- revisar el diff de `package.json`/`package-lock.json` antes de commitear. |

## F. Cierre

- [ ] Todos los bugs de la tabla anterior arreglados y el paso que los
      destapó, re-verificado.
- [ ] `npm run ci` verde.
- [ ] `plan.md` actualizado: criterios de Fases 1-7 tachados, sección
      FASE 8.5 agregada, Fase 9 recortada a solo publicación en tiendas.
- [ ] Entrada de la Fase 8.5 agregada en `PROGRESS.md`.
