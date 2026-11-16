# Market Pulse · Iteración 23

La rama parte de `develop` en `85210ef`. Los 98 ficheros versionados del ZIP son idénticos a ese commit. La exportación de producción se utilizó en modo lectura y se mantuvo fuera de Git.

## Trazabilidad

| PDF | Cambio y verificación | Estado |
| --- | --- | --- |
| 1 · Rendimiento | `52_ReviewInsights.gs` publica por geografía y fecha en Drive con manifiesto atómico. Los casos base cubren la primera página, dos meses y el año actual. `54_Reviews.gs` mantiene el índice compatible, hidrata la página y las aprobaciones efectivas y limita la clasificación interactiva a 250 fallos de índice. `60_WebApp.gs` y `App.html` registran fases y cardinalidades. | Tests locales. La lectura del índice y las rutas frías requieren medición en Apps Script. |
| 1–3 · Panel y supervisor | `51_ReviewOperations.gs` ordena trabajos de reseñas elegibles, da turno a P3 antes de P4, alterna índice e inferencia y conserva cursores. Encola solicitudes de panel y registra reintentos. Se retira la UI de recuperación selectiva. El panel consulta estados con un RPC ligero y las tarjetas de envíos reciben progreso. | Tests locales. Falta validar progreso en ejecuciones reales. La recuperación de ratings tiene su RPC administrativo preexistente. |
| 2–3 · Geografía | `55_ReviewIndex.gs` añade evidencia de uso local y una activación con copia verificada. El dry-run cruza la muestra por ID y simula el histórico por clave. | Cinco atribuciones candidatas. Falta conciliar huellas del Sheet en vivo y ejecutar el escaneo. |
| 3 · Metadatos | `53_PlayReviews.gs` añade un P6 por páginas con corte independiente, pausa de Play compartida y cambios limitados a metadatos. Los tests ejercitan votos y respuestas con fecha inalterada. | Android implementado y probado con datos simulados. iOS condicionado a acceso compatible. |
| 4–5 · Actividad | `App.html` y `DesignSystem.html` adaptan el componente fuente de News Radar `859e609` para Adopción y Accesos desde newsletters. | Falta comparación visual del candidato en dispositivos. |
| 6–7 · Accesos y correos | Las alertas pasan un acceso firmado a través de AccountChooser. La newsletter conserva su edición firmada. Se registran los accesos al cargar la aplicación visible y se deduplican por mensaje de alerta o edición de newsletter. El pie y los CTA se centran. | Tests de firma, cuenta y persistencia por edición. Falta clic de un correo nuevo y comprobación en clientes. |
| 8 · Feedback, pruebas y Alertas | Se retiran columnas redundantes del panel, se muestra metadata de entrega disponible y se incorporan los modos Mensual y Alerta. Alertas conserva el ámbito por usuario y controla cambios, umbrales y revisión concurrente. | Tests de backend y estructura. Falta prueba del formulario y envíos con datos reales. |
| 9 · Administración | Ajustes responsive acotados a Configuración de negocio y Logs y nueva navegación de actividad. | Compilación del cliente validada. Falta comparación visual de escritorio y móvil. |

## Auditoría y simulación

La exportación de Comentarios tenía 414 filas de datos y 414 IDs únicos. Las 414 cruzan de forma unívoca con `MARKET_REVIEWS`, con el mismo texto original. Todas son Android, de la ficha compartida de BBVA Empresas en AR, CO, ES, PE y UY, fechadas entre el 1 de enero y el 13 de noviembre de 2026. De las 414, 168 tienen respuesta coincidente en ambas exportaciones y 139 tienen una fila geográfica con motivo `revoked`. La fecha y el filtro de la exportación explican que su universo tenga un alcance distinto del contador del supervisor.

| Simulación | Antes | Después |
| --- | ---: | ---: |
| Muestra UNKNOWN | 414 | 409 |
| Muestra ES / CO / PE | 0 / 0 / 0 | 1 / 2 / 2 |
| Histórico elegible UNKNOWN | 7.238 | 7.233 |
| Histórico elegible ES / CO / PE / AR | 32 / 2 / 2 / 1 | 33 / 4 / 4 / 1 |

El histórico exportado contiene 81.410 filas de reseñas, 65.492 Android y 15.918 iOS. La simulación examina 7.275 claves elegibles de Android compartido. Las 178 filas geográficas son registros históricos, con revocaciones incluidas. Solo dos huellas coinciden en la simulación sobre el XLSX. La matriz compara decisiones del motor sobre la copia y requiere contrastar huellas y aprobaciones vigentes en el Sheet antes de aplicarla. El CSV por clave usa fragmentos literales cuando detecta evidencia. Incluye cinco candidatos manuales adicionales. Se conserva localmente porque contiene identificadores y fragmentos de reseñas.

## Rendimiento observado

`USAGE_LOG`, 5–16 de noviembre de 2026, RPC correctos. Percentiles por posición ordinal. La muestra mezcla usuarios, filtros, versiones y temperatura de caché.

| Vista y operación | n | p50 | p95 |
| --- | ---: | ---: | ---: |
| Comentarios · review:page | 469 | 11,33 s | 20,97 s |
| Mensual · review:analytics | 219 | 5,55 s | 25,74 s |
| Anual · review:analytics | 253 | 5,82 s | 27,82 s |
| Administración · admin:get | 348 | 9,56 s | 13,58 s |
| Administración · admin:jobs:run | 25 | 14,77 s | 61,15 s |

`RUN_LOG` contiene 17 mediciones de rating, p50 169,47 s y p95 458,26 s. Son ejecuciones programadas. La instrumentación del candidato distingue consulta y caché del servidor, clasificación, agregación y serialización. La comparación después del cambio requiere ejecutar la misma selección en Apps Script y medir por versión y origen.

## Pruebas de aceptación y promoción

| Superficie | Caso pendiente con el candidato |
| --- | --- |
| Resumen y Comentarios | Carga en frío y cálida. País, no atribuible, idioma, página posterior, búsqueda, bloque, plataforma y BEI. Comparar totales, orden y texto con un cálculo de referencia. |
| Mensual y anual | Mes vigente y anterior, cambio de segmento y año, NPS, brecha y mapa de calor. Comprobar la respuesta completa en caché y el estado de actualización si falta índice. |
| Alertas | Estado persistido, modificar y deshacer, umbrales cruzados, guardar, reset y conflicto entre sesiones. |
| Administración | Revisar todas las pestañas en escritorio y móvil. Ver el turno del supervisor, progreso, error, reintento y reanudación. Verificar un correo controlado por edición y un único acceso tras clic y recarga. |
| Sheet y snapshots | Validar contratos reales, reconciliar digest por `review_key`, verificar backup y finalizar índice. Confirmar matriz geográfica, numeradores y denominadores antes de publicar vistas. |

El editor y el Sheet productivos abren con la cuenta corporativa. Los 14 archivos de aplicación cambiados coinciden con `develop` antes de la sincronización. El manifiesto remoto tiene los mismos valores efectivos, con distinto orden de claves. La versión Web probada en lectura es `2026.11.15.78`. En su panel la clasificación mostraba 35.920 de 81.410 y la inferencia 6.854 de 6.854. Ese estado puede provocar una transición de índice visible en el candidato.

La activación histórica se prepara mediante `enableMarketsIteration23Geography`, ejecutada por el propietario en Apps Script. Comprueba una copia recuperable en la carpeta de backups y activa el nuevo criterio. El supervisor reanuda el recorrido por lotes. Verificar antes y después las filas modificadas y el manifiesto de vistas. Si hay que revertir, volver a la versión Web anterior y restaurar las aprobaciones geográficas afectadas desde la copia, previa comparación por clave. Conservar las capturas posteriores. La actualización de Apps Script debe hacerse en el navegador integrado e incluir una nueva versión de la aplicación web corporativa.

Apple ofrece una API de App Store Connect para las aplicaciones autorizadas, con alias y respuesta publicada. El contrato documentado carece de votos útiles y no cubre de forma general las fichas de la competencia. La alternativa es integrar esta API únicamente para apps propias con credenciales corporativas autorizadas. [Documentación de Apple](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-customerreviews)
