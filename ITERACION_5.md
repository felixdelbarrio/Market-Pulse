# Iteración 5

Base local `86c3261`, coincidente con `origin/develop` al iniciar el trabajo.

| Capacidad | Implementación | Evidencia y pendientes |
|---|---|---|
| Acceso privado | `Index.html`, `App.html`, `52_ReviewInsights.gs` | Prueba de composición y autorización en código. Falta comprobar las dos cuentas en Apps Script. |
| Analítica y detalle | `queryMarketsReviews_`, `getMarketsReviewAnalytics`, `getMarketsReviewPage` | Mismo filtro por mercado consultado, plataforma, estrellas, app, bloque y fechas. Las páginas se limitan a 25 reseñas. Diálogo de filtros, chips y recuentos por mercado con pruebas de deduplicación y tienda. Falta probar el recorrido en producción. |
| Mapa y saldo | `renderReviewMatrix`, `renderReviewBalance` | Matriz 12 por 8 y presentación móvil. Saldo mensual sobre todas las estrellas. Faltan capturas y comparación visual. |
| Delta y ejemplos | `summarizeMarketsReviewAnalytics_`, `selectMarketsReviewExample_` | Prueba de saldo acumulado y corte de 30 días. Umbral provisional de cinco reseñas en los primeros 335 días. TF-IDF binario con normalización por longitud y selección por similitud al centroide. |
| Identidad y respuesta | `MARKET_REVIEWS` | El contrato vigente carece de identificador de autor y respuesta verificable. La interfaz muestra la falta de cobertura. |
| Administración | `view-admin` | Conserva entradas, operaciones y tabs existentes. Tarjetas de carga, salud y newsletter. La barra representa la cobertura registrada de la última carga de ratings. Faltan tarjetas de captura y verificación visual. |
| Branding y feedback | Cabecera y correo de Alertas | Marca bIA del ZIP de News Radar. El voto de Alertas usa firma HMAC, caduca tras 30 días, verifica destinatario y guarda una valoración por mensaje. Prueba local de alteración, identidad, caducidad y duplicados. |
| Caché | Consulta compartida de reseñas | La caché se segmenta por consulta, generación de reseñas y revisión funcional. Se invalida después de escrituras de ingesta y traducción. Las consultas nuevas y los payloads que superan el límite leen Sheets. Faltan mediciones p50/p95 y una prueba de carga en vivo. |

## Diseño

| Token existente | Valor o uso | Aplicación |
|---|---|---|
| `--radius-component` | 8 px | Celdas y tarjetas del mapa dentro de `.mp-next`. |
| `--color-primary-light` y `--color-surface` | Intensidad y superficie | Escala de cinco niveles en la matriz. |
| `--space-1` a `--space-3` | Espaciado existente | Filas, controles y paneles en las vistas privadas. |

La marca bIA procede de `assets/bia.png` de News Radar. El botón Cancelar usa `close/close.svg` del ZIP BBVA. El mapa completo de diseño y la comparación visual siguen pendientes.

## Reversión

El cambio agrega endpoints privados y usa los contratos existentes de Sheets. Para revertir una versión publicada, seleccionar la versión anterior de la aplicación web en Apps Script. Para revertir en Git, revertir los commits de la rama. La consulta es de solo lectura.


## Activación de valoraciones

Configurar la propiedad de script `MARKETS_ALERT_FEEDBACK_SECRET` con al menos 32 caracteres aleatorios. Los correos incluyen la marca y solo presentan los botones cuando hay una clave válida. La confirmación autenticada crea `ALERT_FEEDBACK` al registrar el primer voto y guarda el identificador del mensaje, la valoración y la fecha. Abrir un enlace no registra un voto. Validar con un mensaje de prueba autorizado antes de promocionar la versión.
