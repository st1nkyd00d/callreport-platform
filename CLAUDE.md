# callreport-platform

Monorepo para la plataforma multi-tenant de call center (ver `plan.md` para el plan de desarrollo completo por fases, decisiones de arquitectura y criterios de aceptación).

## Registro de progreso por fase

Cada vez que se completen **todos** los criterios de aceptación de una fase de `plan.md`, hay que anotarlo en `PROGRESS.md` (raíz del repo) antes de arrancar la siguiente fase. La entrada debe incluir:

- Fase completada y fecha.
- Qué se hizo (resumen breve, no un diff — el detalle vive en los commits).
- Qué quedó pendiente o deferido explícitamente (aunque no bloquee el criterio de aceptación).
- Notas/gotchas operativos que la próxima fase (o la próxima sesión) necesita saber.

`plan.md` es el plan; `PROGRESS.md` es la bitácora de qué tan avanzado está el proyecto — así siempre queda claro en qué fase estamos, qué falta y por qué, sin tener que reconstruirlo desde el historial de git.
