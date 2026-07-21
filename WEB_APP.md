# Dashboard web de Markets Ratings

## Por que esta arquitectura

La interfaz se sirve desde el mismo Apps Script que actualiza el Google Sheet. `Index.html` usa `google.script.run`, por lo que no necesita publicar la hoja, gestionar CORS ni distribuir credenciales al navegador. El control de acceso es el del propio despliegue.

El backend evita enviar las 32k observaciones completas:

- `getMarketsDashboardBootstrap()` devuelve la ultima foto, metadatos, consolidados, incidencias, logos y la tendencia inicial de 18 meses; el primer grafico no necesita una segunda llamada.
- `getMarketsDashboardTrends(filters)` devuelve series mensuales filtradas, con un maximo de 36 meses.
- `CacheService` actua como nivel rapido L1 durante seis horas y se comparte entre todos los usuarios.
- `PropertiesService` conserva como nivel L2, sin caducidad, el bootstrap y hasta 36 meses de tendencias, comprimidos y divididos en bloques seguros.
- La foto ejecutiva se pinta primero y las tendencias se solicitan en segundo plano.
- El snapshot mas reciente se localiza leyendo solo el final de `DASHBOARD_COMPETITION`, no sus 32k fechas.
- Las filas Android, iOS y Huawei, tanto en geografia como en competencia, abren fichas web oficiales con geografia explicita en otra pestaña; los enlaces se resuelven desde `APP_CATALOG` y nunca usan esquemas de tiendas nativas.
- `Resumen` y `Evolucion` no muestran el selector competitivo: todos los mercados representan BBVA Empresas por geografia y un mercado individual representa el mercado completo. El selector de universo solo se muestra en `Benchmark`.
- `Alertas` carga un contrato privado independiente; el servidor deriva la cuenta desde `Session.getActiveUser()` y nunca confia en un email del cliente. Esa identidad protege el autoservicio, no limita el trigger programado.
- Los rankings permiten abrir la ficha oficial de cualquier participante —BBVA, banco, fintech o neobanco— haciendo clic en toda la fila.
- Cada volumen Android se identifica por `packageName`. Si el package aparece en varios paises, el bootstrap lo marca como ficha compartida para contabilizarlo una sola vez en los KPI y no atribuirlo a una tarjeta geografica. Los packages exclusivos de un pais, iOS y Huawei mantienen alcance de mercado.
- El snapshot incluye placeholders ligeros para apps activas sin observacion en la fecha publicada; asi la cobertura usa como denominador el catalogo esperado y no solo las respuestas correctas.
- El selector historico y su API se eliminaron: la aplicacion siempre representa la revision materializada mas reciente.

## Despliegue

1. Sincronice el proyecto:

   ```bash
   cp .clasp.json.example .clasp.json
   clasp push
   ```

2. En Apps Script, abra **Implementar > Nueva implementacion**.
3. Seleccione **Aplicacion web**.
4. Configure **Ejecutar como: yo**.
5. Limite **Quien tiene acceso** al dominio o grupo corporativo que corresponda.
6. Autorice los scopes y abra la URL `/exec` entregada por Google.
7. En cambios posteriores, use **Gestionar implementaciones > Editar > Nueva version**. Un `clasp push` no actualiza por si solo una version ya desplegada.
8. Tras el primer despliegue, ejecute una vez `warmMarketsDashboardCache()` para materializar la revision existente. Desde ese momento, cada RUN diario sustituye automaticamente ambas capas justo despues de actualizar los datasets.
9. Ejecute `setupProject()` con esta version para crear `ALERT_SUBSCRIPTIONS`, active `SEND_ALERT_EMAILS` y valide el canal con **Enviar prueba** en la pestaña `Alertas`.

El autoservicio requiere que el despliegue corporativo exponga el email del usuario a `Session.getActiveUser()`. Abra la URL con una cuenta `@bbva.com` y confirme que la pestaña muestra esa misma cuenta antes de activar la operacion. Mantenga **Ejecutar como: yo** para que los usuarios no necesiten acceso directo al Sheet y restrinja el acceso al dominio o grupo BBVA.

El trigger no actua como el usuario que visita la pantalla. `runDailyRatingMonitor()` se ejecuta como propietario del proyecto, lee todas las suscripciones activas y agrupa un correo por destinatario. Por tanto, la aplicacion puede estar cerrada y no necesita una sesion conectada para enviar.

## Comprobacion rapida

Abra la URL `/exec` del despliegue y confirme que el pie muestra `Contrato 2026.07.21.7 · Web 2026.07.21.18`, las tarjetas aparecen sin espera adicional, los filtros actualizan las tendencias y `Alertas` muestra el email conectado. Active temporalmente el canal y pulse **Enviar prueba**; la pantalla devuelve un identificador `COM-*`, destinatario, cuenta ejecutora, cuota, versiones y estado de auditoria. `MailApp` confirma la aceptación de la solicitud, no la entrega final: si el mensaje no aparece, busque el identificador exacto en Recibidos, spam y cuarentena corporativa.

## Comportamiento esperado

- Los rankings incompletos no se presentan como posiciones validas.
- Un rating ausente nunca se convierte en cero.
- El dashboard indica si el ultimo RUN fue `OK`, `PARTIAL` o `ERROR`.
- Las incidencias muestran pais, plataforma, app, estado y detalle del `FETCH_LOG` del ultimo RUN.
- Los totales acumulados y del periodo usan `RATING_COUNT` y su variacion real a 30 dias, deduplicados por la identidad territorial o compartida de cada ficha.
- **Descargar informe** construye un documento editorial independiente del dashboard y conserva la vista, el mercado, la plataforma, el benchmark y el periodo activos. `Resumen`, `Benchmark` y `Evolucion` producen documentos diferentes; `Alertas` no ofrece descarga analitica. No se incluye una seccion de confianza o metodologia. La exportacion espera la tipografia corporativa y pagina en A4 horizontal sin cabeceras del navegador, recortes laterales ni vistas ocultas duplicadas.
- El rating consolidado solo aparece cuando existen pesos documentados y cobertura suficiente; en su defecto se etiqueta explicitamente una media observada.
- El layout se adapta a desktop, tablet y movil sin librerias externas.

## Operacion

Las vistas analiticas son de solo lectura; `Alertas` solo escribe la fila privada del usuario conectado en `ALERT_SUBSCRIPTIONS`. La primera visita registra `REGISTERED_AT` y cada acceso actualiza `LAST_SEEN_AT`; las pruebas y entregas actualizan sus columnas correspondientes para auditoria administrativa.

El trigger diario y `runNow()` actualizan datasets, evaluan para todos los usuarios las reglas diaria, desde inicio de mes, desde inicio de año y cruce competitivo, deduplican eventos en `ALERT_LOG` y agrupan un unico resumen por destinatario. La regla anual es la unica caida activa por defecto. MTD/YTD solo notifican una vez por periodo, app y severidad salvo que el usuario active recordatorios. `SEND_ALERT_EMAILS = TRUE` no fuerza un correo: si el RUN devuelve `ALERTS_CREATED = 0`, no existe ningun evento que enviar.

Al terminar, el RUN construye una generacion nueva, cambia el puntero persistente de forma atomica y elimina la anterior. Si L1 caduca, se repone desde L2 sin abrir el spreadsheet. Si la materializacion falla, ambas capas se invalidan para que la siguiente peticion reconstruya desde Google Sheets en lugar de servir una revision antigua.
