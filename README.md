# Markets Ratings Web App

Monitor de ratings publicos de Google Play, Apple App Store y Huawei AppGallery, servido como Google Apps Script Web App. El Google Sheet es el almacenamiento operativo; toda la experiencia de consulta vive en `src/Index.html` y `src/60_WebApp.gs`.

## Arquitectura activa

El libro maestro contiene nueve pestañas:

- `CONTROL`: parametros operativos.
- `APP_CATALOG`: apps, geografias, identificadores de tienda, pesos y evidencias.
- `RATINGS`: historico diario normalizado.
- `DASHBOARD_COMPETITION`: snapshots de rating, ranking, volumen, frescura y enlaces web de tienda.
- `DASHBOARD_TRENDS`: series mensuales compactas.
- `FETCH_LOG`: resultado de cada consulta por app.
- `ALERT_LOG`: alertas deduplicadas.
- `ALERT_SUBSCRIPTIONS`: configuracion privada, personalizada y auditable de cada usuario.
- `RUN_LOG`: trazabilidad de ejecuciones.

`DASHBOARD_COMPETITION` alimenta las tarjetas y benchmarks. `DASHBOARD_TRENDS` alimenta las graficas. Los consolidados se calculan durante la construccion de la cache desde el snapshot y los pesos de `APP_CATALOG`; no existe una tabla wide intermedia.

## Puesta en marcha

1. Cree `.clasp.json` desde el ejemplo y sincronice:

   ```bash
   cp .clasp.json.example .clasp.json
   clasp push
   ```

2. Ejecute `setupProject()` una vez. Inicializa el contrato, aplica formato, completa las semillas necesarias, retira las hojas obsoletas `DASHBOARD_KPIS` y `REVIEWS` e instala el trigger diario.
3. Ejecute `validateProject()` y revise el resultado.
4. Ejecute `runNow()` con `SEND_ALERT_EMAILS = FALSE` y compruebe `RUN_LOG` y `FETCH_LOG`.
5. Cree o actualice el despliegue **Aplicacion web**, con **Ejecutar como: yo** y acceso restringido al dominio o grupo apropiado.
6. Abra la pestaña `Alertas` con una cuenta `@bbva.com` y confirme que aparece su email. Si la identidad queda vacia, revise el acceso corporativo del despliegue antes de habilitar correos.
7. Cambie `SEND_ALERT_EMAILS` a `TRUE`, guarde `CONTROL` y use **Enviar prueba** desde `Alertas` para validar el canal sin depender de que se dispare una regla.
8. Ejecute `warmMarketsDashboardCache()` después de publicar una nueva version.

Un `clasp push` no cambia una version ya desplegada. Use **Gestionar implementaciones > Editar > Nueva version**.

## Operacion

- `runDailyRatingMonitor()`: entrada diaria unica.
- `runNow()`: ejecucion manual.
- `rebuildAllMetrics()`: recalcula ranking, variaciones y datasets compactos sin consultar las stores.
- `validateProject()`: valida catalogo y contrato.
- `setupProject()`: inicializacion e instalacion idempotente del trigger.
- `warmMarketsDashboardCache()`: reconstruccion manual de cache compartida.
- `sendMarketsAlertTestEmail()`: prueba el canal BBVA para el usuario conectado y devuelve un identificador de entrega, cuenta ejecutora, cuota y versiones. La aceptación de `MailApp` queda auditada como evento `TEST`; la entrega final al buzón depende de Gmail y de la cuarentena corporativa.

La cache tiene dos niveles: `CacheService` para acceso rapido y `PropertiesService` para persistencia compartida comprimida. Cada RUN reemplaza la generacion despues de actualizar los datasets. Si falla, se invalida para que la siguiente peticion reconstruya desde Sheets.

Los enlaces de Android, iOS y Huawei se generan como HTTPS web con geografia explicita, se validan contra dominios oficiales y se abren en otra pestaña. Esto se aplica tanto a BBVA como a la competencia.

`Resumen` y `Evolucion` no muestran el selector `Benchmark`. Para todos los mercados representan las series territoriales de BBVA Empresas; al elegir un mercado muestran todo su mercado. El selector competitivo solo aparece en `Benchmark`, donde permite comparar bancos, fintech y neobancos en una unica pagina. Cada fila del ranking enlaza a la ficha web oficial de la app.

## Alertas privadas

La pestaña `Alertas` obtiene la identidad con `Session.getActiveUser()` y no acepta un email enviado por el navegador. Cada usuario solo lee, guarda, restaura y prueba su propia configuracion. Al entrar por primera vez queda registrado, incluso si mantiene las alertas pausadas.

- Caida diaria: ultimo rating frente a la observacion anterior.
- Caida desde inicio de mes: ultimo rating frente a la primera observacion del mes.
- Caida desde inicio de año: ultimo rating frente a la primera observacion del año; es la unica ventana activa por defecto.
- Las tres ventanas son independientes y combinables, con limites personales `0,30/0,50` por defecto.
- Los avisos MTD/YTD no se repiten durante el mismo periodo y severidad. Una escalada amarilla a roja si avisa; el usuario puede habilitar recordatorios diarios mientras persista la caida.
- Cruce competitivo: avisa cuando un competidor supera a BBVA Empresas o BBVA recupera la posicion.
- Ambito personalizado por mercado y plataforma, pausa global y restauracion de valores recomendados.
- Un unico email-resumen BBVA por usuario y ejecucion, con logotipo oficial, paleta corporativa y radios `16/8 px`.

La regla propuesta de porcentaje de reseñas de 1 y 2 estrellas conserva sus valores `15%/30%`, pero aparece explicitamente como **WIP · Fuente pendiente**: las fuentes actuales solo entregan rating y volumen agregados. No se evalua hasta incorporar una fuente autorizada con reparto de estrellas de las ultimas 24 horas.

### Seguridad y administracion

- Autoservicio: las funciones web usan la sesion corporativa y solo permiten operar sobre la fila propia.
- Ejecucion programada: `runDailyRatingMonitor()` y `runNow()` se ejecutan como propietario, leen **todas** las filas activas de `ALERT_SUBSCRIPTIONS` y envian aunque ningun usuario tenga la aplicacion abierta.
- Administrador: la hoja `ALERT_SUBSCRIPTIONS` muestra email, estado, reglas, alta, ultimo acceso, ultima prueba y ultima entrega. `validateProject()` devuelve ademas usuarios registrados, activos, pausados y suscripciones por ventana.
- Los usuarios del Web App no reciben acceso directo al Sheet ni pueden consultar la configuracion de otra cuenta.

`SEND_ALERT_EMAILS = TRUE` habilita el canal, pero `runNow()` solo envia si `ALERTS_CREATED > 0`. El resultado manual incluye `alerts`, `alertSubscribers` y `emailsSent`; use **Enviar prueba** para distinguir un problema de entrega de la ausencia legitima de eventos.

El volumen de Google Play se gobierna por `packageName`: si el mismo package esta activo en varios paises, sus valoraciones y su variacion a 30 dias representan una unica ficha compartida. El Web App las contabiliza una sola vez en los KPI y no las atribuye a las tarjetas geograficas. Un package exclusivo de un pais —como el Android de Mexico— conserva alcance de mercado. iOS y Huawei mantienen alcance territorial.

## Reglas de datos

- Ratings validos: escala publica 1–5; una ausencia nunca se convierte en cero.
- Ranking: solo se publica con cobertura completa del conjunto esperado.
- Reejecucion diaria: actualiza por clave determinista y no duplica observaciones.
- Fallos de store: conservan el historico y quedan trazados en `FETCH_LOG`.
- Consolidados: requieren pesos positivos, fuente, fecha efectiva y cobertura completa.
- Cobertura: compara observaciones publicadas con todas las apps activas esperadas en `APP_CATALOG`.
- Distribucion de reseñas por estrellas: pendiente de una fuente autorizada y geograficamente comparable; nunca se infiere desde el rating agregado.

## Pruebas

```bash
npm test
```

La suite cubre adaptadores, normalizacion, ranking, variacion y volumen a 30 dias, materializaciones, consolidados, cache persistente, URLs oficiales, reglas de alerta, privacidad de preferencias, email BBVA y compilacion del HTML.

Consulte [WEB_APP.md](WEB_APP.md) para detalles del despliegue y comportamiento de cache.
