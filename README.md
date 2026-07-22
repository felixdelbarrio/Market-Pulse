# Markets Ratings Web App

Monitor de ratings publicos de Google Play, Apple App Store y Huawei AppGallery, servido como Google Apps Script Web App. El Google Sheet es el almacenamiento operativo; toda la experiencia de consulta vive en `src/Index.html` y `src/60_WebApp.gs`.

## Arquitectura activa

El libro maestro contiene nueve pestañas:

- `CONTROL`: parametros operativos.
- `APP_CATALOG`: apps, geografias, identificadores de tienda, pesos y evidencias.
- `RATINGS`: historico diario normalizado.
- `DASHBOARD_COMPETITION`: snapshots de rating, ranking, volumen, frescura y enlaces web de tienda.
- `DASHBOARD_TRENDS`: cierres mensuales compactos de rating y volumen acumulado.
- `FETCH_LOG`: resultado de cada consulta por app.
- `ALERT_LOG`: alertas deduplicadas.
- `ALERT_SUBSCRIPTIONS`: configuracion privada, personalizada y auditable de cada usuario.
- `RUN_LOG`: trazabilidad de ejecuciones.

`DASHBOARD_COMPETITION` alimenta las tarjetas y benchmarks. `DASHBOARD_TRENDS` alimenta las gráficas y el Pulso mensual de `Evolución`. Los consolidados se calculan durante la construccion de la cache desde el snapshot y los pesos de `APP_CATALOG`; no existe una tabla wide intermedia.

## Puesta en marcha

1. Cree `.clasp.json` desde el ejemplo y sincronice:

   ```bash
   cp .clasp.json.example .clasp.json
   clasp status
   clasp push
   ```

   Antes de publicar, confirme que `clasp status` enumera los archivos de `src/`; una lista vacia significa que no se subira ningun cambio.

2. Ejecute `setupProject()` una vez. La funcion solicita todos los permisos del manifiesto, valida el contrato vigente, aplica formato, completa las semillas necesarias, registra al ejecutor inicial en `CONTROL.ADMIN_EMAILS` e instala los triggers diario y de vigilancia. Añada despues otros administradores `@bbva.com` separados por coma. Los encabezados existentes deben coincidir exactamente con esta version: no se amplian contratos antiguos de forma automatica.
3. Ejecute `validateProject()` y revise el resultado.
4. Ejecute `runNow()` con `SEND_ALERT_EMAILS = FALSE` y compruebe `RUN_LOG` y `FETCH_LOG`.
5. Cree o actualice el despliegue **Aplicacion web**. El manifiesto fija `executeAs: USER_DEPLOYING` y `access: DOMAIN`: confirme en la interfaz **Ejecutar como: yo** y acceso para el dominio BBVA.
6. Abra la pestaña `Alertas` con una cuenta `@bbva.com` y confirme que aparece su email. Si la identidad queda vacia, revise el acceso corporativo del despliegue antes de habilitar correos.
7. Ejecute `authorizeAndInstallMarketsAutomation()` desde el editor, acepte expresamente `gmail.send`, `gmail.settings.basic` y `userinfo.email`, y compruebe que devuelve `verificationStatus: accepted`. Este paso es obligatorio al incorporar permisos nuevos: un trigger no puede mostrar el dialogo de autorización.
8. Cambie `SEND_ALERT_EMAILS` a `TRUE`, guarde `CONTROL` y use **Enviar prueba** desde `Alertas` para validar el canal sin depender de que se dispare una regla.
9. Ejecute `sendMarketsMonitorHealthTestEmail()` y confirme que el aviso tecnico queda registrado en el grupo configurado.
10. Ejecute `rebuildAllMetrics()` después de publicar esta version. La funcion sustituye el contrato materializado de `DASHBOARD_TRENDS`, incorpora `RATING_COUNT_EOM` y precalienta ambas capas de cache; no ejecute solo `warmMarketsDashboardCache()` antes de esta reconstruccion.

Un `clasp push` no cambia una version ya desplegada. Use **Gestionar implementaciones > Editar > Nueva version**.

Para compartir la aplicacion utilice exclusivamente la URL canónica completa que devuelve `validateProject().webAppUrl` o que aparece en `Administracion > Salud`. Debe terminar en `/exec` y conservar todos sus segmentos; un despliegue corporativo puede incluir `/a/macros/bbva.com/`. No comparta enlaces de Drive, del editor, URLs `/dev` ni direcciones recortadas o construidas manualmente. En iPhone, Chrome debe estar usando el perfil corporativo `@bbva.com`; una cuenta personal no cumple el acceso `DOMAIN` y Google puede mostrar una pagina generica de Drive antes de ejecutar `doGet()`.

## Operacion

- `runDailyRatingMonitor()`: entrada diaria unica.
- `runNow()`: ejecucion manual.
- `rebuildAllMetrics()`: recalcula ranking, variaciones y datasets compactos sin consultar las stores.
- `validateProject()`: valida catalogo y contrato.
- `setupProject()`: inicializacion e instalacion idempotente del trigger.
- `warmMarketsDashboardCache()`: reconstruccion manual de cache compartida.
- `authorizeAndInstallMarketsAutomation()`: solicita los scopes vigentes, valida el alias y reinstala ambos triggers bajo la cuenta efectiva.
- `checkDailyRatingMonitorHealth()`: verifica a las 09:15 que existe un run util del dia y que el canal de alertas no termino en error.
- `sendMarketsMonitorHealthTestEmail()`: prueba el canal tecnico independiente dirigido a `MONITOR_ADMIN_EMAIL`.
- `validateMarketsAlertSender()`: confirma que `voc-commercial.group@bbva.com` esta autorizado y verificado como identidad **Enviar como** para la cuenta ejecutora.
- `sendMarketsAlertTestEmail()`: prueba el canal BBVA para el usuario conectado y devuelve identificador de entrega, grupo remitente, cuenta ejecutora, Gmail Message ID y versiones. La aceptación de la API queda auditada como evento `TEST`; la entrega final al buzon depende de Gmail y de la cuarentena corporativa.

La cache tiene dos niveles: `CacheService` para acceso rapido y `PropertiesService` para persistencia compartida comprimida. Cada RUN reemplaza la generacion despues de actualizar los datasets. Si falla, se invalida para que la siguiente peticion reconstruya desde Sheets.

El proceso de datos y el canal de correo son dominios de fallo independientes. Un error al validar o usar el alias no descarta los ratings ya obtenidos ni convierte una carga util en un falso run vacio. `RUN_LOG` conserva suscriptores, emails aceptados, estado del canal y detalle. Una alerta solo se incorpora al conjunto deduplicado despues de que Gmail la acepte; si el alias o un destinatario fallan, queda disponible para reintento en el siguiente run.

Los enlaces de Android, iOS y Huawei se generan como HTTPS web con geografia explicita, se validan contra dominios oficiales y se abren en otra pestaña. Esto se aplica tanto a BBVA como a la competencia.

La interfaz no utiliza logotipos ni símbolos visuales de Android, iOS o Huawei. Selector, tablas, tarjetas, alertas, incidencias, administración e informes identifican las plataformas exclusivamente mediante texto.

`Resumen` y `Evolucion` no muestran el selector `Benchmark`. `Resumen` compara el rating actual por Android, iOS y Huawei: con todos los mercados muestra `BBVA + geografia`; con un mercado muestra BBVA y sus bancos comparables. `Evolucion` contiene el historico gráfico y, justo debajo, el Pulso mensual de BBVA Empresas: presenta los seis cierres más recientes hasta el periodo seleccionado —tres en móvil— con rating y volumen compacto por plataforma. Mercado, plataforma y periodo se aplican jerárquicamente al bloque; los packages Android compartidos muestran `N/D` porque Google Play no permite atribuir ese volumen a un país. El selector competitivo solo aparece en `Benchmark`, donde permite comparar bancos, fintech y neobancos en una unica pagina. Cada fila del ranking enlaza a la ficha web oficial de la app. Mercado, plataforma, benchmark y periodo se conservan en `localStorage`, aislados por email, para restaurarlos en la siguiente visita.

## Informe ejecutivo

**Descargar informe** no imprime las pantallas del dashboard. Genera un entregable BBVA COMMERCIAL condicionado por la vista y los filtros activos. `Resumen` incluye lectura ejecutiva, panorama geografico, comparativa actual por plataforma y detalle; siempre utiliza el último cierre disponible. `Benchmark` exporta el ranking completo de todas las aplicaciones visibles, no solo BBVA y el líder. `Evolucion` conserva mercado, plataforma y periodo e incorpora el Pulso mensual hasta el mes elegido. En `Alertas` y `Administracion` la descarga analitica se oculta para no mezclar datos de mercado con informacion privada; una vista no soportada nunca se sustituye silenciosamente por Resumen. El informe no incluye una seccion de metodologia. El renderer espera Benton Sans BBVA, reutiliza el logotipo oficial de `BrandAssets` y pagina las tablas antes de imprimir para que ninguna fila o grafico quede cortado.

## Alertas privadas

La pestaña `Alertas` obtiene la identidad con `Session.getActiveUser()` y no acepta un email enviado por el navegador. Cada usuario solo lee, guarda, restaura y prueba su propia configuracion. Al entrar por primera vez queda registrado, incluso si mantiene las alertas pausadas.

- Caida diaria: ultimo rating frente a la observacion anterior.
- Caida desde inicio de mes: ultimo rating frente a la primera observacion del mes.
- Caida desde inicio de año: ultimo rating frente a la primera observacion del año; es la unica ventana activa por defecto.
- Las tres ventanas son independientes y combinables, con limites personales `0,30/0,50` por defecto.
- Los avisos MTD/YTD no se repiten durante el mismo periodo y severidad. Una escalada amarilla a roja si avisa; el usuario puede habilitar recordatorios diarios mientras persista la caida.
- Cruce competitivo: avisa cuando un competidor supera a BBVA Empresas o BBVA recupera la posicion.
- Ambito multiseleccion por mercado y plataforma (`Todos`, uno o varios), pausa global y restauracion de valores recomendados.
- Un unico email-resumen BBVA por usuario y ejecucion, con logotipo oficial, paleta corporativa y radios `16/8 px`.

La regla propuesta de porcentaje de reseñas de 1 y 2 estrellas conserva sus valores `15%/30%`, pero aparece explicitamente como **WIP · Fuente pendiente**: las fuentes actuales solo entregan rating y volumen agregados. No se evalua hasta incorporar una fuente autorizada con reparto de estrellas de las ultimas 24 horas.

### Seguridad y administracion

- Autoservicio: las funciones web usan la sesion corporativa y solo permiten operar sobre la fila propia.
- Ejecucion programada: `runDailyRatingMonitor()` y `runNow()` se ejecutan como propietario, leen **todas** las filas activas de `ALERT_SUBSCRIPTIONS` y envian aunque ningun usuario tenga la aplicacion abierta.
- Administrador: solo las cuentas incluidas en `CONTROL.ADMIN_EMAILS` ven la pestaña `Administracion`. Su endpoint vuelve a autorizar en servidor antes de devolver versiones, configuracion operativa, ejecuciones, incidencias, suscripciones y eventos. La interfaz agrupa ese unico contrato en las pestañas internas Salud, Ejecuciones, Captura, Suscripciones y Alertas, sin nuevas RPC. Ocultar la pestaña no se usa como control de seguridad.
- Los usuarios del Web App no reciben acceso directo al Sheet ni pueden consultar la configuracion de otra cuenta.

`SEND_ALERT_EMAILS = TRUE` habilita el canal, pero `runNow()` solo envia si `ALERTS_CREATED > 0`. El resultado manual incluye `alerts`, `alertSubscribers` y `emailsSent`; use **Enviar prueba** para distinguir un problema de entrega de la ausencia legitima de eventos.

El volumen de Google Play se gobierna por `packageName`: si el mismo package esta activo en varios paises, sus valoraciones y su variacion a 30 dias representan una unica ficha compartida. El Web App las contabiliza una sola vez en los KPI y no las atribuye a las tarjetas geograficas. Un package exclusivo de un pais —como el Android de Mexico— conserva alcance de mercado. iOS y Huawei mantienen alcance territorial.

Cada correo de alerta muestra discretamente la fecha efectiva de los datos e incluye un botón compatible con Gmail y un enlace alternativo hacia la URL corporativa fija de la aplicación, válida en escritorio y móvil con sesión `@bbva.com`. El segundo trigger se ejecuta dos horas despues del proceso principal y emite un unico aviso operativo por dia cuando el run falta, no produjo datos utilizables o el canal de alertas quedo degradado. La configuracion recomendada del grupo, la diferencia entre alias y buzon, y la secuencia de reautorizacion estan documentadas en [GOOGLE_WORKSPACE_SETUP.md](GOOGLE_WORKSPACE_SETUP.md).

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
