# Iteración 5

Base local `86c3261`, coincidente con `origin/develop` al iniciar el trabajo.

| Capacidad | Implementación | Evidencia y pendientes |
|---|---|---|
| Acceso privado | `Index.html`, `App.html`, `52_ReviewInsights.gs` | Prueba de composición y autorización en código. Falta comprobar las dos cuentas en Apps Script. |
| Analítica y detalle | `queryMarketsReviews_`, `getMarketsReviewAnalytics`, `getMarketsReviewPage` | Mismo filtro por mercado consultado, plataforma, estrellas, app, bloque y fechas. Las páginas se limitan a 25 reseñas. Falta probar el recorrido en producción. |
| Mapa y saldo | `renderReviewMatrix`, `renderReviewBalance` | Matriz 12 por 8 y presentación móvil. Saldo mensual sobre todas las estrellas. Faltan capturas y comparación visual. |
| Delta y ejemplos | `summarizeMarketsReviewAnalytics_`, `selectMarketsReviewExample_` | Prueba de saldo acumulado y corte de 30 días. Umbral provisional de cinco reseñas en los primeros 335 días. TF-IDF binario con normalización por longitud y selección por similitud al centroide. |
| Identidad y respuesta | `MARKET_REVIEWS` | El contrato vigente carece de identificador de autor y respuesta verificable. La interfaz muestra la falta de cobertura. |
| Administración | `view-admin` | Conserva entradas, operaciones y tabs existentes. Falta adaptar tarjetas de jobs y progreso al patrón News Radar. |
| Branding y feedback | Cabecera y correo de Alertas | Pendientes de revisar los activos y el flujo seguro de feedback de News Radar. |
| Caché | Consulta compartida de reseñas | Quedan pendientes caché por generación y mediciones p50/p95. La consulta lee la hoja en cada solicitud de página. |

## Diseño

| Token existente | Valor o uso | Aplicación |
|---|---|---|
| `--radius-component` | 8 px | Celdas y tarjetas del mapa dentro de `.mp-next`. |
| `--color-primary-light` y `--color-surface` | Intensidad y superficie | Escala de cinco niveles en la matriz. |
| `--space-1` a `--space-3` | Espaciado existente | Filas, controles y paneles en las vistas privadas. |

El mapa de diseño de News Radar, la selección de iconos oficiales y el diálogo avanzado de Comentarios quedan pendientes.

## Reversión

El cambio agrega endpoints privados y usa los contratos existentes de Sheets. Para revertir una versión publicada, seleccionar la versión anterior de la aplicación web en Apps Script. Para revertir en Git, revertir los commits de la rama. La consulta es de solo lectura.
