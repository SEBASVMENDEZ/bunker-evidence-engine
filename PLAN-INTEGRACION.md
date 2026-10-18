# Plan de integración — Búnker como centro del día

> Para Claude Code. Guarda este archivo en la raíz del repositorio `bunker-evidence-engine`.
> Antes de empezar, lee `README.md` y `src/lib/content.ts`. Trabaja un paquete a la vez, con su rama y su PR.

## La decisión de fondo
- **Búnker es el centro del día de Sebastián**: su rutina, sus turnos, su ruta y su domingo ya viven aquí. Todo lo nuevo entra como "puentes" pequeños, no como apps nuevas.
- **Atlas (repo `repaso-activo`) sigue siendo un producto para otras personas.** No se le meten datos personales (deudas, rutina). Solo recibe conceptos de los cursos con su importador actual ("Importar conceptos desde un texto").
- **El repositorio de Búnker es PÚBLICO.** Nunca escribas en el código cifras de deudas, sueldos, nombres de bancos ni datos personales. Todo dato personal se ingresa desde la app (Ajustes) y vive en IndexedDB y en el respaldo.
- Regla de diseño: todo lo nuevo debe caber en **menos de 15 minutos al día** y en un toque cuando se pueda.

## Contrato de calidad
- `npm run typecheck` y `npm run build` en verde antes de cada commit. Muestra la salida resumida en el PR.
- Cada criterio de "Terminado cuando" se marca ✅ con su prueba o ❌ con el motivo.
- Los datos existentes del usuario no se pueden perder. Si cambias el formato, respaldo primero y migración probada.
- Sin dependencias nuevas, salvo que sea imprescindible y esté justificado en el PR.
- Explícale a Sebastián cada paso en español sencillo: es principiante.

## Paquete I-0 — Rutina para la temporada (sin código)
Guía a Sebastián para hacerlo él mismo en **Ajustes**:
- **Estudio** = Inglés iF12, 20 min, *antes del turno*, 6 días por semana.
- **Lectura** = su libro, 10 min. Aplicar las técnicas de Genio Lector solo si le sirven.
- **Trading**: desactivar hasta abril de 2027. Desde abril, 1 vez por semana como "Riesgo y disciplina (estudio, sin plata real)".
- El resto queda igual.

Terminado cuando: la ruta de "Hoy" muestra el nuevo orden y Sebastián lo confirma con una captura.

## Paquete I-1 — Puente a Atlas
- En la sesión guiada y en "Hoy", cuando el paso es **Estudio** o **Lectura**, mostrar el botón **"Repasar en Atlas"**, que abre https://atlas-recuerda.vercel.app en otra pestaña.
- Al volver, una pregunta opcional de un toque: "¿Repasaste tus conceptos?" (Sí / Hoy no). Se guarda como un hecho más del día.

Terminado cuando: el botón aparece solo en esos dos pasos, abre Atlas, la respuesta queda en el día y entra al respaldo.

## Paquete I-2 — Ruta de estudio dentro de Búnker
- Nuevo archivo `src/lib/plan-estudio.ts` con las fases (sin datos personales):
  - Fase 1 (19 oct 2026 – 3 ene 2027): Inglés iF12, 6 × 20 min.
  - Fase 2 (4 ene – 28 mar 2027): Inglés 6 × 30 min + Academia de Trabajo Virtual 3 × 45 min.
  - Fase 3 (29 mar – 27 jun 2027): Inglés 5 × 30 min, Trabajo Virtual 2 × 45 min, Riesgo y disciplina 1 × 45 min, lectura opcional.
  - Hitos: 1 feb 2027 aplicar a 2 plataformas de entrenamiento de IA; 28 mar decisión; 27 jun evaluación.
- En "Hoy", bajo el paso Estudio: "Esta semana: Inglés · 6 × 20 min · llevas 3".

Terminado cuando: la fase cambia sola según la fecha y el conteo semanal coincide con las sesiones hechas.

## Paquete I-3 — Tarjeta "Dinero hoy"
- **Ajustes → Pagos:** lista editable (nombre, valor, día del mes, protegido sí/no). Vacía por defecto. Se puede importar desde un archivo JSON que Sebastián tiene en su PC (nunca desde el repositorio).
- En "Hoy": si hay pagos en los próximos 3 días, una tarjeta con cada pago, un toque para marcar "pagado" y un aviso en rojo si alguno está vencido. Si no hay, la tarjeta no aparece.
- Entra al respaldo completo.

Terminado cuando: un pago a 2 días aparece, al marcarlo desaparece, un pago vencido sin marcar sale en rojo y nada de esto está en el código fuente.

## Paquete I-4 — El domingo también mira el dinero y el estudio
- Una cuarta mirada en Domingo: pagos a tiempo de la semana, deuda total (Sebastián escribe el número del último extracto, opcional) y sesiones de estudio frente a la meta.
- La película incluye una tarjeta corta con esas tres cifras.

Terminado cuando: con datos de ejemplo, Domingo muestra las tres cifras y la película las incluye; sin datos, dice "sin datos" y no inventa nada.

## Paquete I-5 — Vehículos de ingreso en Brújula
- Plantillas listas (no activas por defecto) para: "Entrenar IA desde casa", "Fotos y catálogos para tiendas", "Mostrador", cada una con su hipótesis, su fecha de revisión y su regla de corte (si a fin de marzo no hay ingresos, se cierra).

Terminado cuando: Sebastián puede activar una plantilla con un toque y aparece en la revisión del domingo.

## Orden
I-0 → I-1 → I-2 → I-3 → I-4 → I-5. Al terminar cada uno, actualiza el README y deja un resumen de 5 líneas para pegar en el chat con Claude.
