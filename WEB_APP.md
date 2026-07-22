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
- `Resumen` sustituye la trayectoria duplicada por barras de rating actual en Android, iOS y Huawei: todos los mercados comparan BBVA por geografia y un mercado individual compara BBVA con los bancos del pais. Añade una matriz de los ocho ultimos cierres con rating y opiniones por plataforma, servida desde la misma tendencia cacheada. El historico grafico queda en `Evolucion`; el selector de universo solo se muestra en `Benchmark`.
- `Alertas` carga un contrato privado independiente; el servidor deriva la cuenta desde `Session.getActiveUser()` y nunca confia en un email del cliente. Esa identidad protege el autoservicio, no limita el trigger programado.
- `Administracion` solo se anuncia a cuentas incluidas en `CONTROL.ADMIN_EMAILS`; `getMarketsAdminDashboard()` repite la autorizacion en servidor antes de leer datos privados. Salud, Ejecuciones, Captura, Suscripciones y Alertas son pestañas internas accesibles que reutilizan una sola respuesta.
- Los filtros analiticos se guardan en `localStorage` bajo una clave derivada del email y se validan contra el contrato vigente antes de restaurarse.
- Los rankings permiten abrir la ficha oficial de cualquier participante —BBVA, banco, fintech o neobanco— haciendo clic en toda la fila.
- Cada volumen Android se identifica por `packageName`. Si el package aparece en varios paises, el bootstrap lo marca como ficha compartida para contabilizarlo una sola vez en los KPI y no atribuirlo a una tarjeta geografica. Los packages exclusivos de un pais, iOS y Huawei mantienen alcance de mercado.
- El snapshot incluye placeholders ligeros para apps activas sin observacion en la fecha publicada; asi la cobertura usa como denominador el catalogo esperado y no solo las respuestas correctas.
- El selector historico y su API se eliminaron: la aplicacion siempre representa la revision materializada mas reciente.

## Despliegue

1. Sincronice el proyecto:

   ```bash
   cp .clasp.json.example .clasp.json
   clasp status
   clasp push
   ```

   `clasp status` debe listar los archivos de `src/`, incluido `src/50_Alerts.gs` y `src/appsscript.json`. Si muestra una lista vacia, no continue con el despliegue porque Apps Script conservara el backend anterior.

2. En Apps Script, abra **Implementar > Nueva implementacion**.
3. Seleccione **Aplicacion web**.
4. Configure **Ejecutar como: yo**.
5. Limite **Quien tiene acceso** al dominio o grupo corporativo que corresponda.
6. Autorice los scopes y abra la URL `/exec` entregada por Google.
7. En cambios posteriores, use **Gestionar implementaciones > Editar > Nueva version**. Un `clasp push` no actualiza por si solo una version ya desplegada.
8. Ejecute `setupProject()` con esta version para validar los contratos persistentes vigentes.
9. Ejecute una vez `rebuildAllMetrics()`: reemplaza `DASHBOARD_TRENDS` con el contrato actual, incluido `RATING_COUNT_EOM`, y precalienta L1/L2. Desde ese momento, cada RUN diario sustituye automaticamente ambas capas justo despues de actualizar los datasets.
10. Ejecute manualmente `authorizeAndInstallMarketsAutomation()` desde el editor, acepte todos los scopes y confirme que el alias queda `accepted`. Esto reinstala el proceso de las 07:05 y su vigilancia de las 09:15 bajo la misma cuenta autorizada.
11. Active `SEND_ALERT_EMAILS`, valide el canal con **Enviar prueba** en `Alertas` y ejecute `sendMarketsMonitorHealthTestEmail()`.

El autoservicio requiere que el despliegue corporativo exponga el email del usuario a `Session.getActiveUser()`. Abra la URL con una cuenta `@bbva.com` y confirme que la pestaña muestra esa misma cuenta antes de activar la operacion. Mantenga **Ejecutar como: yo** para que los usuarios no necesiten acceso directo al Sheet y restrinja el acceso al dominio o grupo BBVA.

El trigger no actua como el usuario que visita la pantalla. `runDailyRatingMonitor()` se ejecuta como propietario del proyecto, lee todas las suscripciones activas y agrupa un correo por destinatario. Por tanto, la aplicacion puede estar cerrada y no necesita una sesion conectada para enviar.

Los avisos se envian individualmente mediante la API de Gmail con **BBVA VoC Commercial `<voc-commercial.group@bbva.com>`** como identidad `From`. El grupo nunca es destinatario ni distribuye las alertas personalizadas. Antes de enviar, el backend comprueba que esa direccion figure en Gmail > **Enviar como** para la cuenta ejecutora y que su estado sea `accepted`; si falta o sigue pendiente, se detiene esa entrega sin recurrir a la direccion personal, pero el proceso de datos continua. El manifiesto limita el acceso a `gmail.send` y `gmail.settings.basic`: permite enviar y comprobar las identidades autorizadas, pero no leer el buzon.

La comprobacion del alias ya no puede invalidar una carga de ratings correcta. Si falla, las alertas afectadas no se auditan como entregadas, permanecen reintentables y `RUN_LOG.ALERT_DELIVERY_STATUS` queda en `ERROR` o `PARTIAL`. El monitor tecnico usa un envio independiente al destino `MONITOR_ADMIN_EMAIL`, de forma que pueda advertir precisamente de una incidencia en el canal principal.

Despues de crear el grupo, añadalo en Gmail > Configuracion > Cuentas > Enviar como para la cuenta propietaria del trigger, complete la verificacion recibida por el grupo y ejecute `validateMarketsAlertSender()`. El resultado correcto incluye `available: true`, `verificationStatus: accepted` y `address: voc-commercial.group@bbva.com`. Si cambia el remitente, actualice `ALERT_SENDER_ALIAS` en `CONTROL`.

## Comprobacion rapida

Abra la URL `/exec` del despliegue y confirme que el pie muestra `Contrato 2026.07.22.15 · Web 2026.07.22.26`, la matriz mensual aparece entre las señales y el detalle geografico, los filtros actualizan rating y opiniones, y `Alertas` muestra el email conectado. Verifique también que una cuenta administradora ve `Administracion`, puede alternar sus cinco pestañas internas, y una cuenta ordinaria no la ve. Active temporalmente el canal y pulse **Enviar prueba**; la pantalla devuelve un identificador `COM-*`, destinatario, grupo remitente, cuenta ejecutora, Gmail Message ID, versiones y estado de auditoria. La API confirma la aceptación de la solicitud, no la entrega final: si el mensaje no aparece, busque el identificador exacto en Recibidos, spam o cuarentena corporativa. Confirme tambien que el correo incluye, en cuerpo pequeno, la fecha de obtencion de los datos.

## Comportamiento esperado

- Los rankings incompletos no se presentan como posiciones validas.
- Un rating ausente nunca se convierte en cero.
- El dashboard indica si el ultimo RUN fue `OK`, `PARTIAL` o `ERROR`.
- Las incidencias muestran pais, plataforma, app, estado y detalle del `FETCH_LOG` del ultimo RUN.
- Los totales acumulados y del periodo usan `RATING_COUNT` y su variacion real a 30 dias, deduplicados por la identidad territorial o compartida de cada ficha.
- La matriz mensual usa `RATING_EOM` y `RATING_COUNT_EOM` de la misma ultima observacion real de cada mes. Un package Android compartido aparece como `N/D`, nunca como una estimacion geografica.
- **Descargar informe** construye un documento editorial independiente del dashboard y conserva la vista, el mercado, la plataforma, el benchmark y el periodo activos. `Resumen`, `Benchmark` y `Evolucion` producen documentos diferentes; `Alertas` no ofrece descarga analitica. No se incluye una seccion de confianza o metodologia. La exportacion espera la tipografia corporativa y pagina en A4 horizontal sin cabeceras del navegador, recortes laterales ni vistas ocultas duplicadas.
- El rating consolidado solo aparece cuando existen pesos documentados y cobertura suficiente; en su defecto se etiqueta explicitamente una media observada.
- El layout se adapta a desktop, tablet y movil sin librerias externas.

## Operacion

Las vistas analiticas son de solo lectura; `Alertas` solo escribe la fila privada del usuario conectado en `ALERT_SUBSCRIPTIONS`. La primera visita registra `REGISTERED_AT` y cada acceso actualiza `LAST_SEEN_AT`; las pruebas y entregas actualizan sus columnas correspondientes para auditoria administrativa.

El trigger diario y `runNow()` actualizan datasets, evaluan para todos los usuarios las reglas diaria, desde inicio de mes, desde inicio de año y cruce competitivo, deduplican eventos en `ALERT_LOG` y agrupan un unico resumen por destinatario. La regla anual es la unica caida activa por defecto. MTD/YTD solo notifican una vez por periodo, app y severidad salvo que el usuario active recordatorios. `SEND_ALERT_EMAILS = TRUE` no fuerza un correo: si el RUN devuelve `ALERTS_CREATED = 0`, no existe ningun evento que enviar.

Al terminar, el RUN construye una generacion nueva, cambia el puntero persistente de forma atomica y elimina la anterior. Si L1 caduca, se repone desde L2 sin abrir el spreadsheet. Si la materializacion falla, ambas capas se invalidan para que la siguiente peticion reconstruya desde Google Sheets en lugar de servir una revision antigua.

Consulte [GOOGLE_WORKSPACE_SETUP.md](GOOGLE_WORKSPACE_SETUP.md) antes de modificar el grupo: explica que una direccion de Google Groups no posee una carpeta Enviados de Gmail y detalla la configuracion segura para identidad, historial y vigilancia.
