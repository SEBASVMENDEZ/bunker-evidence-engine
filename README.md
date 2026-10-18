# BÚNKER · Evidence Engine

> “Yo grabo. El sistema hace el resto.”

Sistema personal de evidencia basado en la propuesta del Búnker Evidence Engine y el Proyecto Maestro (CD1–CD11).
Grabas tu rutina; Búnker organiza, clasifica y edita en segundo plano; el domingo ves **una sola película de tu semana**, con métricas honestas, un insight útil y las preguntas de revisión para decidir la siguiente mejora.

**Revisar → cambiar → seguir.**

**App publicada:** https://sebasvmendez.github.io/bunker-evidence-engine/ (HTTPS: funciona en el celular, con cámara, y se instala con “Agregar a pantalla de inicio”).

---

## Cómo abrirla

- **Desde cualquier dispositivo:** abre la dirección publicada de arriba en Chrome o Edge.
- **En este computador, sin internet:** doble clic en `INICIAR.bat` (la primera vez instala lo necesario; requiere [Node.js](https://nodejs.org)) y se abre `http://localhost:4173`.

Tus datos viven en el navegador de cada dispositivo y en cada dirección por separado: elige una y úsala siempre. Para vincular carpetas y tu hoja de horarios usa **Chrome o Edge** en el computador.

Para desarrollo: `npm run dev` (http://localhost:5173).

---

## Sin horarios: ritmo y turnos

Tus turnos rotan, así que Búnker **no usa el reloj** para saber qué grabaste:

- **El orden de tu rutina.** Ordenas tus áreas una vez (oración → meditación → estiramiento → lectura → ejercicio → trading → proyecto → reflexión). Cada día, Búnker alinea la secuencia de videos con ese orden, usando además la **duración típica** de cada área. Saltarte un área o cambiar el orden no lo rompe.
- **Antes / después del turno.** Cada área se marca como *antes del turno*, *después* o *cuando se pueda*. En el almuerzo es normal retomar lo pendiente.
- **Tus turnos.** Vinculas tu hoja de horarios (`.ods` de LibreOffice o `.xlsx`) y Búnker lee **solo tu fila**: entrada, salida, almuerzo y días de descanso (los vacíos). Reconoce la fecha de cada semana por la fila de números de los días, por títulos como “Semana del 16 al 20 de Junio” o por el nombre de la hoja (OCTUBRE), y verifica que el día de la semana coincida. Si actualizas la hoja, se relee sola al abrir Búnker. Sin hoja: marcas la semana con un toque por día (tus turnos frecuentes ya aparecen como opciones).
- **Aprende de ti.** Cada video que confirmas se vuelve un ancla: ordena a sus vecinos del día y afina las duraciones típicas.
- **Pregunta solo cuando hay duda real**, y nunca supone: un video que no encaja con nada (p. ej. uno personal en pleno turno) va a *Evidencia → por confirmar*, con la opción “No es de mi rutina”.

Con los turnos, Domingo te muestra cuántas áreas sueles lograr con **turno temprano, turno tarde o descanso**, y te ayuda a planear la semana siguiente.

### Time-lapse (×5, ×10…)

Una hora de estudio grabada a ×10 es un archivo de 6 minutos. Búnker detecta los time-lapse (no tienen audio; algunos Android además guardan la velocidad exacta en el video), calcula la **duración real** para métricas y clasificación, y en la película no los vuelve a acelerar de más. Si la velocidad no viene en el archivo, considera ×5 o ×10 y te pregunta cuando hay duda; puedes fijar la velocidad habitual de cada área en *Ajustes* o corregir un video con un toque. No hay duración mínima: los clips de menos de 12 s se tratan como “transición”.

---

## El flujo

### Durante la semana: un toque

| Opción | Cómo |
|---|---|
| **Cámara del celular, con la app en el celular** | Graba como siempre (time-lapse incluido). En Búnker toca *Importar videos* y elige los del día en la galería. Búnker los **lee sin copiarlos** (no duplica espacio): guarda solo la clasificación, la miniatura y 3 cuadros de vista previa (~30 KB cada uno). La película del domingo usa el video si está a mano y, si no, sus cuadros de vista previa. Volver a elegir un video lo reconecta, sin duplicarlo. |
| **Cámara del celular, con la app en el PC** | Activa la copia automática de videos de tu celular a una carpeta del PC (Google Drive para escritorio, OneDrive, Fotos de Windows/Enlace móvil). En Búnker: *Evidencia → Vincular carpeta*. Al abrir la app los videos nuevos entran solos; si el navegador vuelve a pedir permiso, basta un clic en *Sincronizar* (en Hoy o Evidencia). |
| **Búnker Camera** | Pestaña *Cámara*: el área ya viene elegida (la siguiente en tu rutina) y, al terminar una toma, la siguiente queda lista. Modos Auto / Normal / Proceso / Reflexión, ★ para marcar un momento importante, grabación de pantalla para trading. |
| **Arrastrar y soltar** | Suelta videos sobre la ventana desde cualquier carpeta. |

Nada se etiqueta ni se renombra. Los originales **nunca** se copian, mueven ni borran (salvo que tú los quites).

### Del cumplir al aprender (retroalimentación de mi maestro)

- **Una línea de aprendizaje** al terminar cada sesión guiada, con la pregunta que le sirve a esa área (lectura: “¿qué idea entendiste y cómo la aplicarías?”; trading: “¿qué decisión tomaste y por qué?”, y el domingo “¿qué pasó después?”; ejercicio: “¿qué hiciste mejor que la vez pasada?”). Opcional, se puede dictar. Y un toque para lo que lo hizo difícil (cansancio, poco tiempo, interrupción…).
- **El domingo en tres miradas**: lo que hiciste (días y minutos por área, con sesiones guiadas aunque no haya video, y cuánto de la ruta cumpliste), lo que aprendiste (tus líneas y las dificultades que se repitieron) y lo que estás construyendo (tus áreas agrupadas por lo que buscan en tu vida, tu dirección y los vehículos que estás probando).
- **Patrones de 4 semanas**, cada uno con su tamaño de muestra: cuánto de la ruta haces, qué mantienes en días de cansancio y qué cae primero, según el turno, cuánto tardas en retomar un hábito, las dificultades que se repiten y tu hora real de dormir. Son observaciones para investigar, no conclusiones.
- **Memoria de experimentos** (Brújula): situación y posible explicación → prueba → lo que observaste → conclusión provisional (continuar, modificar, investigar otra explicación). Lo comprobado, separado de lo supuesto.
- **La cuarta mirada: dinero y estudio.** Tres cifras de la semana: pagos a tiempo (los que vencían esa semana y marcaste *Pagado* antes de terminar su día), deuda total (la escribes tú del último extracto; muestra la diferencia con la anterior) y sesiones de estudio frente a la meta de la fase. La película las incluye en una tarjeta corta después de las métricas. Si falta un dato dice “sin datos”: nunca inventa una cifra. Aparece aunque la semana no tenga videos.
- **Respaldo completo** en un solo archivo (rutina, turnos, ruta, aprendizajes, revisiones, experimentos y huellas): en el celular se comparte a Drive; se restaura en un toque. Domingo avisa si llevas una semana sin copia.

### Puente a Atlas

[Atlas](https://atlas-recuerda.vercel.app) es la app de repaso activo donde practicas los conceptos de tus cursos. Búnker no le manda nada (ni rutina ni datos personales): solo la abre.

- En **Hoy** (bajo los pasos *Estudio* y *Lectura* de tu ruta, y en la tarjeta grande cuando el siguiente paso es uno de ellos) y en la **sesión guiada** (mientras el cronómetro está en Estudio o Lectura) aparece **Repasar en Atlas**, que la abre en otra pestaña. En los demás pasos no aparece.
- Al volver, una pregunta opcional de un toque: **¿Repasaste tus conceptos?** (Sí / Hoy no). Se guarda como un hecho más del día (la última respuesta del día manda) y entra al **respaldo completo**. Si no respondes, la pregunta se va sola al terminar el día.

### Ruta de estudio

Bajo el paso *Estudio* de tu ruta, Búnker te dice qué pide esta semana tu plan de estudio y cuánto llevas: “Esta semana: Inglés · 6 × 20 min · llevas 3”. La fase cambia sola con la fecha:

| Fase | Fechas | Cada semana |
|---|---|---|
| 1 | 19 oct 2026 – 3 ene 2027 | Inglés 6 × 20 min |
| 2 | 4 ene – 28 mar 2027 | Inglés 6 × 30 min + Trabajo virtual 3 × 45 min |
| 3 | 29 mar – 27 jun 2027 | Inglés 5 × 30 min + Trabajo virtual 2 × 45 min · Riesgo y disciplina 1 × 45 min (bajo *Trading*) · lectura opcional |

Cuenta cada sesión guiada o “Ya lo hice” de esa área; un día sin eso pero con video del área cuenta como una sesión. Dos semanas antes de cada hito (1 feb: aplicar a 2 plataformas de entrenamiento de IA · 28 mar: decisión · 27 jun: evaluación) lo recuerda bajo *Estudio*. Las fases viven en `src/lib/plan-estudio.ts`.

### Dinero hoy

- **Ajustes → Pagos:** tu lista de pagos del mes (nombre, valor, día, protegido sí/no). Empieza vacía. Se llena a mano o con **Importar**, eligiendo un archivo `.json` de tu dispositivo: `{"pagos": [{"nombre": "…", "valor": 0, "dia": 15, "protegido": true}]}`. Los nombres que ya existen se actualizan, sin duplicar.
- **En Hoy**, solo si hay algo: una tarjeta con lo que vence en los próximos 3 días y lo vencido sin marcar (en rojo), cada uno con **Pagado** de un toque. Sin pagos cerca, la tarjeta no aparece. Lo que venció antes de que agregaras un pago no se cuenta como vencido (no hay falsas alarmas al importar).
- Tus pagos viven solo en tu dispositivo y en el **respaldo completo**: nunca en el código, que es público.

### La huella: tu evidencia en MB, no en GB

Cada video que entra se resume en su **huella**: 16–72 cuadros repartidos a lo largo de todo el video (480 px) y, si hablas (reflexiones), tu voz en un WAV liviano. Medido con 4 videos reales: **1,4 GB → 4,5 MB**, procesados en 39 s.

- **La película se arma con las huellas**: cada actividad es un time-lapse continuo con fundidos (sin decodificar 1080p a ×16 en vivo, que era lo que trababa y repetía escenas). Las reflexiones suenan con tu voz guardada. Un limitador evita que la voz y la música se saturen.
- **Ya no dependes del original**: después de importar puedes borrar los videos de la galería (Evidencia te dice cuánto liberas). Sin Drive, sin carpetas.
- **Evidencia ligera en la sesión guiada**: activa la cámara (frontal o trasera) y Búnker toma un cuadro cada pocos segundos (y tu voz en las reflexiones) y los guarda directo como huella, ya con su área. Ni archivos de video ni importar.

### Rápida en el celular

Sin efectos que se recalculen en cada cuadro (fondo quieto, tarjetas sólidas, sin desenfoques) y carga por partes: al abrir solo se prepara *Hoy*; la película, la cámara, el domingo y los ajustes llegan al pedirlos.

### Tu Ruta: el plan del día que se arma solo

En *Hoy*, Búnker no te da una lista: te dice **qué toca ahora** y lo empiezas con un botón.

- **El sueño es el ancla.** Con tu turno, tu traslado y las horas que necesitas, calcula a qué hora acostarte para tener mañana. Si vienes acostándote tarde, planea con tu hora real y la adelanta 15 min por noche (y nunca te planea menos de tu sueño mínimo antes de trabajar).
- **Nunca cero.** Cada hábito tiene versión mínima (oración 3 min, meditación 3, estiramiento 5, lectura 5…) y completa. En un día pesado se hace el mínimo de todo; cuando hay tiempo, crecen. Lo que no cabe sube de prioridad mañana (nunca dos ceros seguidos).
- **Días libres = vacaciones.** Sin turno, vuelve la rutina completa en la mañana, en orden.
- **¿Cómo amaneciste?** Un toque en la mañana (cansado / normal / con energía) ajusta la ruta: cansado → solo crecen los hábitos tranquilos y queda más aire.
- **Sesión guiada.** *Empezar* abre un cronómetro a pantalla completa que te lleva de un hábito al siguiente con voz y campana; no tienes que mirar el teléfono. *Solo el mínimo*, *Más tarde* y *Ya lo hice* para los días reales.
- **Mi día** (icono de ajustes en la tarjeta): sueño, traslado, alistarte, al llegar, tiempo para ti antes de salir, y la versión mínima/completa y prioridad (★) de cada hábito.

### Bloques: varias actividades en un solo video

Si grabas el bloque de la mañana de corrido (oración → meditación → estiramiento → lectura), Búnker lo divide solo en **tramos**. Con la cámara fija, cada actividad tiene su postura y su sitio en el cuadro: se toman ~160 cuadros, se compara cada uno con el fondo y se buscan los cortes que mejor separan el video. Un corte solo cuenta si te cambias de sitio o pasas de estar quieto a moverte (cambiar de postura en la misma silla no es otra actividad). Cada tramo se clasifica con el orden de tu rutina y, después de tu primera confirmación, con la forma de tu cuerpo en cada actividad.

Medido con 12 videos reales: 12/12 bien divididos (bloques en 2–3 tramos; ejercicio y sesiones de computador sin cortes) y 22/22 tramos reconocidos entre días. Si algo queda mal, en el clip: **Dividir en este punto** o **Unir**, y elegir el área.

### Frente al computador: trading, estudio, proyecto

Con la cámara mirándote, las tres se ven iguales. Un toque **antes** de grabar lo resuelve: en *Hoy*, “¿Vas a grabar con la cámara del celular?” → Trading / Estudio / Proyecto, o mantén presionado el ícono de Búnker → *Grabo: Trading*. El primer video que empiece en los siguientes 45 minutos queda en esa área, sin preguntas. Sin marca, Búnker usa tu hora habitual de cada área (aprendida) y te pregunta con las opciones más probables primero.

### El domingo: una sola pieza

1. **Hoy** te muestra “Tu película de la semana está lista” → *Ver mi película*.
2. La película se arma sola: intro, resumen con mosaico y tus turnos de la semana, un capítulo por área (o por día), procesos largos acelerados, explicaciones y reflexiones a velocidad real con su audio, comparación con la semana anterior, métricas, insight, pregunta de revisión y prioridad siguiente. Banda sonora generativa que baja cuando hablas.
3. Al terminar, *Ir a la revisión*: 8 preguntas del Proyecto Maestro, plan de la próxima semana con tus turnos, decisión (mantener / corregir / cambiar una variable / evaluar el vehículo), prioridad y **un solo experimento**.
4. **Sellar la semana.** El experimento te acompaña en *Hoy* toda la semana, y el domingo siguiente la película empieza recordándotelo.
5. Opcional: *Exportar* la película como video MP4/WebM para guardarla como memoria.

Atajos en la película: `Espacio` pausa · `←` `→` capítulos · `F` pantalla completa · `M` música.

---

## Cómo decide Búnker (sin magia)

**Fecha real:** se lee del nombre del archivo (`VID_20261003_062000`, `20261003_062000`, `PXL_…`, `WIN_…`, WhatsApp), luego de los metadatos MP4/MOV, y solo al final de la fecha del archivo. Así un video sincronizado días después cae en el día correcto.

**Área:** palabras clave en el nombre → orden de tu rutina + duración típica + momento del turno → tus confirmaciones como anclas. Confianza real por video (si es baja, pregunta).

**Tratamiento en la película:**

| Tipo | Tratamiento | Ejemplo |
|---|---|---|
| Proceso largo | Acelerar (varios momentos, ≈×8 efectivo) | Entrenamiento, lectura |
| Explicación | Velocidad normal, con audio | Trading, proyecto |
| Transición | Un destello | Preparar espacio |
| Reflexión | Completa | Mensaje final del día |
| Repetición | Montaje rápido | Varias tomas cortas iguales |

La película se ajusta a la duración objetivo (Ajustes o Domingo). Los momentos marcados con ★ se muestran siempre a velocidad real.

**Insight Engine:** separa siempre **MÉTRICA** (hecho), **OBSERVACIÓN** (comparación), **INFERENCIA** (posible tendencia, solo con datos suficientes, aclarando que no es una causa demostrada) y **SIN DATOS** (“no hay base para concluirlo”). Nunca fabrica métricas psicológicas. Si la semana aún no termina, lo dice.

---

## Además

- **Brújula:** el ciclo Dirección → Vehículo → Experimento → Evidencia → Revisión → Cambio → Nuevo experimento, tu dirección y el porqué, vehículos como hipótesis con fecha de revisión, rueda “persona completa, no perfecta” y los 13 principios.
- **Modo calma:** el protocolo de frustración (Parar → Observar → Regular con respiración guiada → Revisar la evidencia real → Decidir → Continuar).
- **Tablero diario mínimo:** las 5 preguntas en 60 segundos, opcional.
- **Grabación segura:** cada segundo se guarda un fragmento; si se cierra la app o se apaga el equipo, la grabación se recupera al reabrir.
- **Sin internet:** funciona offline (PWA). Sin cuentas ni nube: todo queda en tu dispositivo. *Ajustes → Exportar respaldo* guarda configuración, turnos, revisiones e índice (no los videos).

---

## Estructura del código

```
src/
  lib/
    classify.ts       Inteligencia de captura por ritmo (orden + duración + turno + anclas), time-lapse
    sheet.ts          Lector de hojas de horarios (.ods / .xlsx)
    film/edl.ts       Motor de edición: qué partes entran, a qué velocidad, en qué capítulo
    film/draw.ts      Escenas de la película dibujadas en canvas
    film/engine.ts    Reproductor: dos <video> alternados, fundidos, audio + música
    film/export.ts    Exportación a archivo de video
    insights.ts       Métricas, comparaciones (incluido por tipo de turno) e Insight Engine
    media.ts          Fecha real, duración, miniaturas y detección de time-lapse
    recorder.ts       Búnker Camera con guardado seguro por fragmentos
    sound.ts          Efectos y banda sonora sintetizados (sin archivos de audio)
    db.ts             Almacenamiento local (IndexedDB)
    content.ts        Áreas, principios y preguntas del Proyecto Maestro
    atlas.ts          Puente a Atlas: qué pasos lo muestran y cómo se guarda "¿repasaste?"
    plan-estudio.ts   Ruta de estudio: fases por fecha, metas semanales, hitos y conteo de sesiones
    dinero.ts         Dinero hoy: vencimientos, "pagado" por mes y lectura del archivo de pagos
    balance.ts        La cuarta mirada del domingo: pagos a tiempo, deuda total y estudio
  components/Turnos.tsx  Semana de turnos y vínculo con la hoja
  components/Atlas.tsx   Botón "Repasar en Atlas" y la pregunta de un toque al volver
  components/Pagos.tsx   Tarjeta "Dinero hoy" y la lista de pagos de Ajustes
  screens/            Hoy, Cámara, Evidencia, Domingo, Brújula, Ajustes, Modo calma, Película
  store.ts            Estado e ingesta (importar, vincular, procesar, reclasificar, aprender)
```

React + TypeScript + Vite. Sin servidor: todo corre en el navegador. Cada cambio en `main` se publica solo en GitHub Pages.

## Plan de integración

Búnker es el centro del día; lo nuevo entra como puentes pequeños. Ver [`PLAN-INTEGRACION.md`](PLAN-INTEGRACION.md): I-0 rutina de temporada (en Ajustes, sin código) · **I-1 puente a Atlas ✅** · **I-2 ruta de estudio ✅** · **I-3 “Dinero hoy” ✅** · **I-4 domingo con dinero y estudio ✅** · I-5 vehículos de ingreso.

## Siguientes pasos posibles

- Transcripción automática de explicaciones y reflexiones (p. ej. Whisper) para buscar por lo que dijiste.
- Sincronización opcional entre celular y PC.
- Detección automática de silencios y segmentos repetitivos.
