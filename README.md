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
  components/Turnos.tsx  Semana de turnos y vínculo con la hoja
  screens/            Hoy, Cámara, Evidencia, Domingo, Brújula, Ajustes, Modo calma, Película
  store.ts            Estado e ingesta (importar, vincular, procesar, reclasificar, aprender)
```

React + TypeScript + Vite. Sin servidor: todo corre en el navegador. Cada cambio en `main` se publica solo en GitHub Pages.

## Siguientes pasos posibles

- Transcripción automática de explicaciones y reflexiones (p. ej. Whisper) para buscar por lo que dijiste.
- Sincronización opcional entre celular y PC.
- Detección automática de silencios y segmentos repetitivos.
