# Market Pulse

Monitor de ratings publicos de Google Play, Apple App Store y Huawei AppGallery, servido como Google Apps Script Web App. El Google Sheet es el almacenamiento operativo; toda la experiencia de consulta vive en `src/Index.html` y `src/60_WebApp.gs`.

Android e iOS forman el núcleo operativo y determinan si una captura está completa. Huawei es una fuente complementaria: sus datos se incorporan cuando están disponibles, pero su ausencia no genera alertas técnicas, no degrada la salud del proceso y no impide cálculos, newsletters, informes ni navegación.

## Arquitectura activa

El libro maestro contiene diez pestañas:

- `CONTROL`: parametros operativos.
- `APP_CATALOG`: apps, geografias, identificadores de tienda, pesos y evidencias.
- `RATINGS`: historico diario normalizado.
- `DASHBOARD_COMPETITION`: snapshots de rating, ranking, volumen, frescura y enlaces web de tienda.
- `DASHBOARD_TRENDS`: cierres mensuales compactos de rating y volumen acumulado.
- `FETCH_LOG`: resultado de cada consulta por app.
- `ALERT_LOG`: alertas deduplicadas.
- `ALERT_SUBSCRIPTIONS`: configuracion privada, personalizada y auditable de cada usuario.
- `RUN_LOG`: trazabilidad de ejecuciones.
- `USAGE_LOG`: telemetría funcional mínima de sesiones, vistas, filtros, acciones e incidencias.

`DASHBOARD_COMPETITION` alimenta las tarjetas y benchmarks. `DASHBOARD_TRENDS` alimenta las gráficas y el Pulso mensual de `Evolución`. Los consolidados se calculan durante la construccion de la cache desde el snapshot y los pesos de `APP_CATALOG`; no existe una tabla wide intermedia.

## Puesta en marcha

1. Cree `.clasp.json` desde el ejemplo y sincronice:

   ```bash
   cp .clasp.json.example .clasp.json
   clasp status
   clasp push
   ```

   Antes de publicar, confirme que `clasp status` enumera los archivos de `src/`; una lista vacia significa que no se subira ningun cambio.

2. Ejecute `setupProject()` una vez. La funcion solicita todos los permisos del manifiesto, valida el contrato vigente, aplica formato, completa las semillas necesarias, registra al ejecutor inicial en `CONTROL.ADMIN_EMAILS` e instala los triggers diario, de vigilancia y de newsletter mensual. Añada despues otros administradores `@bbva.com` separados por coma. Los encabezados existentes deben coincidir exactamente con esta version: no se amplian contratos antiguos de forma automatica.
3. Ejecute `validateProject()` y revise el resultado.
4. Ejecute `runNow()` con `SEND_ALERT_EMAILS = FALSE` y compruebe `RUN_LOG` y `FETCH_LOG`.
5. Cree o actualice el despliegue seleccionando explícitamente **Aplicación web** en el selector de tipo. No seleccione **Biblioteca**: una URL `script.google.com/macros/library/d/...` identifica una versión para consumo desde otros scripts y nunca abre Market Pulse. El manifiesto fija `executeAs: USER_DEPLOYING` y `access: DOMAIN`: confirme en la interfaz **Ejecutar como: yo** y acceso para el dominio BBVA.
6. Abra la pestaña `Alertas` con una cuenta `@bbva.com` y confirme que aparece su email. Si la identidad queda vacia, revise el acceso corporativo del despliegue antes de habilitar correos.
7. Ejecute `authorizeAndInstallMarketsAutomation()` desde el editor, acepte expresamente `gmail.send`, `gmail.settings.basic` y `userinfo.email`, y compruebe que devuelve `verificationStatus: accepted`. Este paso es obligatorio al incorporar permisos nuevos: un trigger no puede mostrar el dialogo de autorización.
8. Cambie `SEND_ALERT_EMAILS` y `SEND_NEWSLETTER_EMAILS` a `TRUE`, guarde `CONTROL`, pruebe las alertas desde `Alertas` y la newsletter exclusivamente desde `Administración` para validar ambos formatos con los últimos datos reales disponibles.
9. Ejecute `sendMarketsMonitorHealthTestEmail()` y confirme que el aviso tecnico queda registrado en el grupo configurado.
10. Ejecute `rebuildAllMetrics()` después de publicar esta version. La funcion sustituye el contrato materializado de `DASHBOARD_TRENDS`, incorpora `RATING_COUNT_EOM` y precalienta ambas capas de cache; no ejecute solo `warmMarketsDashboardCache()` antes de esta reconstruccion.

Un `clasp push` no cambia una version ya desplegada. Use **Gestionar implementaciones > Editar > Nueva version**.

Para compartir la aplicacion utilice exclusivamente la URL canónica completa que devuelve `validateProject().webAppUrl`, el nuevo bloque `validateProject().deployment` o `Administracion > Salud`. También puede abrirla desde el menú del Sheet **Market Pulse > Mostrar URL de la aplicación**. Debe terminar en `/exec` y conservar todos sus segmentos; un despliegue corporativo puede incluir `/a/macros/bbva.com/`. No comparta enlaces `/macros/library/d/`, de Drive, del editor, URLs `/dev` ni direcciones recortadas o construidas manualmente. En iPhone, Chrome debe estar usando el perfil corporativo `@bbva.com`; una cuenta personal no cumple el acceso `DOMAIN` y Google puede mostrar una pagina generica de Drive antes de ejecutar `doGet()`.

## Operacion

- `runDailyRatingMonitor()`: entrada diaria unica.
- `runNow()`: ejecucion manual.
- `rebuildAllMetrics()`: recalcula ranking, variaciones y datasets compactos sin consultar las stores.
- `validateProject()`: valida catalogo y contrato.
- `setupProject()`: inicializacion e instalacion idempotente del trigger.
- `warmMarketsDashboardCache()`: reconstruccion manual de cache compartida.
- `authorizeAndInstallMarketsAutomation()`: solicita los scopes vigentes, valida el alias y reinstala los tres triggers bajo la cuenta efectiva.
- `checkDailyRatingMonitorHealth()`: verifica a las 09:15 que existe un run util del dia y que el canal de alertas no termino en error.
- `runMarketsMonthlyNewsletter()`: el día 1 a las 08:15 envía el cierre ejecutivo del mes anterior; fuera del día 1 termina sin enviar.
- `sendMarketsMonitorHealthTestEmail()`: prueba el canal tecnico independiente dirigido a `MONITOR_ADMIN_EMAIL`.
- `validateMarketsAlertSender()`: confirma que `voc-commercial.group@bbva.com` esta autorizado y verificado como identidad **Enviar como** para la cuenta ejecutora.
- `sendMarketsAlertTestEmail()`: genera una previsualización trazable con las reglas guardadas y el último cierre real disponible; nunca inventa caídas, ratings ni volúmenes.
- `sendMarketsNewsletterTestEmail()`: permite al propietario probar la newsletter desde el menú de la hoja. En la Web App la prueba solo está disponible en `Administración`, para el formato exacto de una suscripción.

La cache tiene dos niveles: `CacheService` para acceso rapido y `PropertiesService` para persistencia compartida comprimida. Cada RUN reemplaza la generacion después de actualizar los datasets. La identidad de esta caché depende de su contrato serializado, no de la versión visual: publicar CSS, UX o wording no provoca una reconstrucción desde Sheets en la primera visita. La lectura persistente agrupa los fragmentos en una única operación y cualquier error de cuota se degrada de forma segura; la caché acelera, pero nunca impide servir datos ya calculados.

El arranque utiliza una única RPC para datos e identidad, tiene un límite de 20 segundos y ofrece reintento visible si Apps Script no responde. El cliente renderiza solamente la vista activa: Benchmark, Evolución, Alertas y Administración se construyen al abrirlas, evitando tablas y SVG ocultos. Los cambios rápidos de filtro se agrupan y las tendencias ya consultadas permanecen en memoria durante la sesión.

El proceso de datos y el canal de correo son dominios de fallo independientes. Un error al validar o usar el alias no descarta los ratings ya obtenidos ni convierte una carga util en un falso run vacio. `RUN_LOG` conserva suscriptores, emails aceptados, estado del canal y detalle. Una alerta solo se incorpora al conjunto deduplicado despues de que Gmail la acepte; si el alias o un destinatario fallan, queda disponible para reintento en el siguiente run.

Los enlaces de Android, iOS y Huawei se generan como HTTPS web con geografia explicita, se validan contra dominios oficiales y se abren en otra pestaña. Esto se aplica tanto a BBVA como a la competencia.

La interfaz no utiliza logotipos ni símbolos visuales de Android, iOS o Huawei. Selector, tablas, tarjetas, alertas, incidencias, administración e informes identifican las plataformas exclusivamente mediante texto.

`Resumen` y `Evolucion` no muestran el selector `Benchmark`. `Resumen` compara el rating actual por Android, iOS y Huawei: con todos los mercados muestra `BBVA + geografia`; con un mercado muestra BBVA y sus bancos comparables. `Evolucion` contiene el historico gráfico y, justo debajo, el Pulso mensual de BBVA Empresas: presenta los seis cierres más recientes hasta el periodo seleccionado —tres en móvil— con rating y volumen compacto por plataforma. Mercado, plataforma y periodo se aplican jerárquicamente al bloque; los packages Android compartidos muestran `N/D` porque Google Play no permite atribuir ese volumen a un país. El selector competitivo solo aparece en `Benchmark`, donde permite comparar bancos, fintech y neobancos en una unica pagina. Cada fila del ranking enlaza a la ficha web oficial de la app. Mercado, plataforma, benchmark y periodo se conservan en `localStorage`, aislados por email, para restaurarlos en la siguiente visita.

`Voz nueva del mes` estima la nota de las opiniones incorporadas entre dos cierres mediante `(N1 × R1 − N0 × R0) / (N1 − N0)`. Solo se publica cuando ambos cierres pertenecen a una ficha atribuible, el volumen aumenta y la incertidumbre causada por la resolución del rating acumulado no supera 0,5 estrellas. La incertidumbre usa los decimales realmente conservados por cada fuente; Google Play puede publicar una sola décima. Desde la versión `2026.07.26.20` la ingestión conserva hasta seis decimales para no perder la precisión que ofrece iOS. Los cierres históricos ya redondeados no se rellenan ni se estiman retrospectivamente.

## Informe ejecutivo

**Descargar informe** no imprime las pantallas del dashboard. Genera un entregable Market Pulse condicionado por la vista y los filtros activos. `Resumen` incluye lectura ejecutiva, panorama geografico, comparativa actual por plataforma y detalle; siempre utiliza el último cierre disponible. `Benchmark` exporta el ranking completo de todas las aplicaciones visibles, no solo BBVA y el líder. `Evolucion` conserva mercado, plataforma y periodo e incorpora el Pulso mensual hasta el mes elegido. En `Alertas` y `Administracion` la descarga analitica se oculta para no mezclar datos de mercado con informacion privada; una vista no soportada nunca se sustituye silenciosamente por Resumen. El informe no incluye una seccion de metodologia. El renderer usa la familia corporativa BBVABentonSans con fallback seguro, Tiempos Headline para titulares y el lockup oficial BBVA Banca de Empresas e Instituciones extraído de la plantilla corporativa en `BrandIdentity`; pagina las tablas antes de imprimir para que ninguna fila o grafico quede cortado.

## Alertas privadas

La pestaña `Alertas` obtiene la identidad con `Session.getActiveUser()` y no acepta un email enviado por el navegador. Cada usuario solo lee, guarda, restaura y prueba su propia configuracion. Al entrar por primera vez queda registrado, incluso si mantiene las alertas pausadas.

- Caida diaria: ultimo rating frente a la observacion anterior.
- Caida desde inicio de mes: ultimo rating frente a la primera observacion del mes.
- Caida desde inicio de año: ultimo rating frente a la primera observacion del año.
- Las tres ventanas están activas por defecto y son independientes: diaria `0,10/0,15`, desde inicio de mes `0,30/0,50` y desde inicio de año `0,30/0,50`.
- Los avisos MTD/YTD no se repiten durante el mismo periodo y severidad. Una escalada amarilla a roja si avisa; el usuario puede habilitar recordatorios diarios mientras persista la caida.
- Al dar de alta desde Administración a una cuenta no administradora, cualquier alerta YTD amarilla o roja ya vigente queda reconocida en `ALERT_LOG` sin correo. Así no se reenvía un hecho pasado; si se activaron recordatorios, la siguiente comprobación diaria sí podrá avisar si la caída continúa.
- Cruce competitivo: avisa cuando un competidor supera a BBVA Empresas o BBVA recupera la posicion.
- Ambito multiseleccion por mercado y plataforma (`Todos`, uno o varios), pausa global y restauracion de valores recomendados.
- Un unico email-resumen BBVA por usuario y ejecucion, con logotipo oficial, paleta corporativa y radios `16/8 px`.
- El wording explica las reglas de forma impersonal —“límite configurado”— y evita atribuir decisiones o acciones al destinatario.

### Newsletter mensual

La newsletter se ejecuta exclusivamente el día 1 y resume el mes natural anterior con datos reales de `RATINGS` y el universo activo de `APP_CATALOG`. Adapta asunto, apertura y agrupación a una geografía, varias geografías o visión global. Su motor editorial identifica cierres generalizados, balances mixtos, principal avance, ajuste más relevante, contexto frente al inicio de año, liderazgo competitivo y concentración de valoraciones. No utiliza un modelo generativo: cada frase se construye a partir de hechos tipados del propio modelo y no puede incorporar cifras, mercados o conclusiones externas. Presenta la trayectoria `Inicio de año → Inicio de mes → Cierre` y, en un bloque separado, las variaciones mensual y anual con su referencia explícita, además de las nuevas valoraciones. La posición competitiva se expresa como `Líder entre N bancos` o `N.ª posición entre M bancos` y solo se publica cuando la cobertura del mercado es completa. El efecto estimado de las nuevas valoraciones se muestra únicamente cuando la fórmula inversa es matemáticamente fiable; si el redondeo o una ficha compartida impiden atribuirlo, se omite.

En visión global, el volumen de una ficha Android compartida se suma una sola vez al total de su plataforma, pero nunca se reparte entre países. Cada envío aceptado se deduplica por mes y destinatario en `ALERT_LOG`. `SEND_NEWSLETTER_EMAILS` permite activar o pausar este canal de forma independiente a las alertas.

La regla propuesta de porcentaje de reseñas de 1 y 2 estrellas conserva sus valores `15%/30%`, pero aparece explicitamente como **WIP · Fuente pendiente**: las fuentes actuales solo entregan rating y volumen agregados. No se evalua hasta incorporar una fuente autorizada con reparto de estrellas de las ultimas 24 horas.

### Seguridad y administracion

- Autoservicio: las funciones web usan la sesion corporativa y solo permiten operar sobre la fila propia.
- Ejecucion programada: `runDailyRatingMonitor()` y `runNow()` se ejecutan como propietario, leen **todas** las filas activas de `ALERT_SUBSCRIPTIONS` y envian aunque ningun usuario tenga la aplicacion abierta.
- Administrador: solo las cuentas incluidas en `CONTROL.ADMIN_EMAILS` ven la pestaña `Administracion`. Cada endpoint vuelve a autorizar en servidor. `Adopción` muestra usuarios únicos y sesiones del día, mes y año, comparación semanal sobre el mismo tramo de días, tendencia de 14 días, secciones y acciones más utilizadas, dispositivos, cuentas con mayor y menor adopción e incidencias de interfaz. Desde `Suscripciones` se monitoriza toda la base de newsletter, se dan de alta cuentas `@bbva.com`, se pausan o reactivan y se modifican su ámbito y reglas de alerta. `Recuperar ratings ahora` lanza bajo demanda el proceso completo y deja su resultado en `RUN_LOG`, igual que una carga programada. Ocultar la pestaña no se usa como control de seguridad.
- Los usuarios del Web App no reciben acceso directo al Sheet ni pueden consultar la configuracion de otra cuenta.

La telemetría empieza a contar después de desplegar esta versión; no reconstruye accesos históricos. El servidor obtiene la identidad de la sesión corporativa y solo persiste metadatos funcionales allowlisted, versión y tipo de dispositivo: no guarda valores de negocio, formularios ni contenido libre salvo el mensaje técnico acotado de una incidencia. La analítica anual lee como máximo los 200.000 eventos más recientes y lo indica expresamente si la lectura queda truncada.

`SEND_ALERT_EMAILS = TRUE` habilita el canal de alertas, pero `runNow()` solo envia si `ALERTS_CREATED > 0`. `SEND_NEWSLETTER_EMAILS = TRUE` habilita el cierre mensual. Las dos pruebas usan datos y configuración reales para distinguir un problema de entrega de la ausencia legítima de eventos.

El volumen de Google Play se gobierna por `packageName`: si el mismo package esta activo en varios paises, sus valoraciones y su variacion a 30 dias representan una unica ficha compartida. El Web App las contabiliza una sola vez en los KPI y no las atribuye a las tarjetas geograficas. Un package exclusivo de un pais —como el Android de Mexico— conserva alcance de mercado. iOS y Huawei mantienen alcance territorial.

Cada correo de alerta muestra discretamente la fecha efectiva de los datos e incluye un botón compatible con Gmail que pasa por el selector de cuentas de Google, preselecciona al destinatario `@bbva.com` y continúa hacia la URL corporativa fija. También conserva un enlace directo alternativo. Este flujo evita que Gmail móvil abra la aplicación con una sesión personal o sin autenticar, sin ampliar el acceso fuera del dominio. El segundo trigger se ejecuta dos horas despues del proceso principal y emite un unico aviso operativo por dia cuando el run falta, no produjo datos utilizables o el canal de alertas quedo degradado. La configuracion recomendada del grupo, la diferencia entre alias y buzon, y la secuencia de reautorizacion estan documentadas en [GOOGLE_WORKSPACE_SETUP.md](GOOGLE_WORKSPACE_SETUP.md).

## Reglas de datos

- Ratings validos: escala publica 1–5; una ausencia nunca se convierte en cero.
- Ranking: solo se publica con cobertura completa del conjunto esperado.
- Reejecucion diaria: actualiza por clave determinista y no duplica observaciones.
- Fallos de store: conservan el historico y quedan trazados en `FETCH_LOG`.
- Consolidados: requieren pesos positivos, fuente, fecha efectiva y cobertura completa.
- Cobertura: compara las observaciones Android e iOS publicadas con sus apps activas esperadas en `APP_CATALOG`; Huawei queda fuera del denominador y se añade únicamente cuando existe un dato válido.
- Distribucion de reseñas por estrellas: pendiente de una fuente autorizada y geograficamente comparable; nunca se infiere desde el rating agregado.

## Pruebas

```bash
npm test
```

La suite cubre adaptadores, normalizacion, ranking, variacion y volumen a 30 dias, materializaciones, consolidados, cache persistente, URLs oficiales, reglas de alerta, privacidad de preferencias, telemetría de adopción, email BBVA y compilacion del HTML.

Consulte [WEB_APP.md](WEB_APP.md) para detalles del despliegue y comportamiento de cache.
