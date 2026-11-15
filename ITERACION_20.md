# Iteración 20 de Market Pulse

La comparación usa el PDF de 16 páginas y el código de News Radar en `develop` (`1a81ada`). En Market Pulse, `dist.txt` ya tenía modificaciones locales y su última revisión registrada era `dd7f3b8`. Se usaron los archivos de `src/` como fuente de verdad.

| PDF | Referencia News Radar | Market Pulse y evidencia | Estado |
| --- | --- | --- | --- |
| 1–3 | `AdministrationView.html`, `administration.js` | `58_Admin.gs`, `51_ReviewOperations.gs`, `55_ReviewIndex.gs`, `52_ReviewInsights.gs` y tarjetas en `App.html`. Tests de entregas, revisión del índice e inferencia. | Parcial. Falta contrastar estados, bloqueos y entregas en Apps Script. |
| 3–6 | `AdoptionView.html`, `Analytics.gs` | `59_UsageAnalytics.gs` y Adopción. Tests de ventana temporal, sesiones por cuenta y cobertura. Navegador con datos simulados para cambio de cohorte. | Parcial. Faltan filtros de fecha y paridad visual. |
| 6–7 | `NewsletterAccessView.html`, `Analytics.gs` | Accesos confirmados por edición con rango, actividad diaria navegable, cohortes de usuarios cuyo acceso coincide con un envío, tabla paginada y exportación. Test de identificación y deduplicación. | Parcial. Los registros históricos no permiten reconstruir sesiones de navegación. |
| 8–9 | `FeedbackView.html`, `admin-tables.js` | `56_Newsletter.gs`, `50_Alerts.gs` y tabla de feedback. Identidad de newsletters recuperada al verificar el ID contra el registro de entrega. Navegador con datos simulados para paginación. | Parcial. Los votos históricos de alertas carecen de una clave de cruce con el registro de envío. |
| 10–12 | `SubscribersView.html`, `administration.css` | Suscripciones conserva su configuración real y muestra la última prueba aceptada disponible y el Gmail ID cuando Gmail lo devuelve durante la prueba. | Parcial. Pendiente validación de alta, edición, baja y auditoría persistente de intentos fallidos. |
| 13 | `ConfigurationView.html`, `admin-tables.js` | Configuración de negocio conserva edición, filtros y exportación. Se aclaró el origen de los catálogos. | Parcial. Pendiente revisión visual y de concurrencia en Apps Script. |
| 14 | `RunsView.html`, `admin-tables.js` | Logs abre Registro de actividad. Filtros, métricas de selección y paginación local. Navegador con datos simulados para cambio de registro y páginas. | Parcial. Rendimiento conserva su vista propia. |
| 15–16 | `Index.html`, `reading-context.js`, `briefing.css` | `doGet`, `Index.html` y `App.html` superponen el diálogo sobre la web. Tests de firma, voto alternativo, vencimiento, observaciones, idempotencia y rutas. Navegador simulado a 1.440 y 390 px. | Implementado y probado localmente. Pendiente prueba de enlace real autenticado. |

## Contratos y verificación

- `ALERT_FEEDBACK` conserva sus tres columnas históricas. La primera escritura autorizada valida sus cabeceras y añade `observation` y `status` al final. Las filas antiguas se muestran como pendientes hasta que se atienden. Una modificación de la valoración vuelve a abrir el seguimiento.
- El estado geográfico se reconstruye una vez si procede de un formato anterior. El nuevo checkpoint conserva el recorrido físico y el denominador elegible por separado. Las altas posteriores amplían el inventario mediante el tramo añadido. Las revisiones de origen invalidan el inventario.
- Verificación local con Node 24 y `npm test`. Baseline de 158 tests. Resultado de 163 tests.
- Comparativa local en Chrome con los mismos datos simulados. La entrada al panel de control pasa de renderizar 25 entradas de captura ocultas a 0, con las mismas RPC de arranque y carga de Administración. La prueba de inferencia reduce de 3.003 a 1 las filas leídas para recalcular el inventario tras añadir una fila, con 3.002 filas previas.
- Pendientes del entorno desplegado. Verificar correspondencia del código y cabeceras, permisos y enlaces firmados, estados reales de la cola, ciclo de newsletter del 1 de noviembre y rendimiento frío/caliente por vista y filtro con datos representativos. La comparación local no acredita paridad visual 1:1 ni una mejora de latencia en producción.
