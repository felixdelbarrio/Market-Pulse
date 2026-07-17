# Markets Ratings

Proyecto unico para monitorizar ratings publicos de Google Play, Apple App Store y Huawei AppGallery en un solo Google Sheet y publicarlos como web app interactiva. Las fuentes materializadas siguen siendo compatibles con Looker Studio para analisis ad hoc.

## Resultado

El libro maestro contiene nueve pestañas operativas:

- `CONTROL`: parametros operativos y contrato de version.
- `APP_CATALOG`: catalogo normalizado de plataforma, pais, app e identificadores de tienda.
- `RATINGS`: fuente principal de Looker Studio, una fila por fecha/plataforma/pais/app.
- `DASHBOARD_KPIS`: fuente wide precalculada, una fila por fecha y campos directos por pais/plataforma para scorecards sin filtros de chart.
- `DASHBOARD_COMPETITION`: fuente combinada para bancos y competidores digitales commercial verificados.
- `DASHBOARD_TRENDS`: agregacion mensual compacta para las pantallas de evolucion.
- `FETCH_LOG`: resultado por app de cada RUN (`OK`, `NO_RATING` o `ERROR`), con HTTP, detalle y frescura.
- `ALERT_LOG`: alertas historicas y nuevas alertas deduplicadas.
- `RUN_LOG`: trazabilidad de migraciones y ejecuciones.

Las antiguas pestañas por pais, `ALL`, `MONTHLY_ALL`, `Resumen` y `ALL_BANCO_*` no se copian: eran vistas derivadas y duplicaban los mismos datos. La tabla larga `RATINGS` permite reconstruirlas con filtros, tablas y graficos de Looker Studio.

## Puesta en marcha

1. Mantenga el Google Sheet maestro `1IkJgvM2imxm3r1x092q5dqpThrlnDoZ-5QvH8n2h2oQ` y haga una copia de seguridad. No lo sustituya por el Excel compacto de referencia, que no duplica `RATINGS`.
2. Abra **Extensiones > Apps Script** en ese mismo Sheet.
3. Copie los archivos de `src/` o desplieguelos con `clasp`:

   ```bash
   cp .clasp.json.example .clasp.json
   clasp push
   ```

4. Ejecute `validateProject()` y revise el objeto devuelto.
5. Ejecute `runNow()` con `SEND_ALERT_EMAILS = FALSE`. La primera ejecucion migra las cabeceras de forma append-only, elimina Italia/Alemania y competidores retail, completa Venezuela y los segmentos commercial digitales verificados, y materializa los datasets de dashboard.
6. Compruebe una nueva fila en `RUN_LOG`, una fila por app en `FETCH_LOG`, ratings del dia en `RATINGS` y datos en las tres fuentes `DASHBOARD_*`.
7. Ejecute `setupProject()` para instalar el trigger diario. Active `SEND_ALERT_EMAILS` solo tras validar destinatarios y umbrales.

## Dashboard web

El repositorio incluye una interfaz HTML responsive y una API de lectura en `src/60_WebApp.gs` y `src/Index.html`. El dashboard consume snapshots diarios y tendencias mensuales sin descargar `RATINGS` completa en el navegador.

Tras ejecutar `clasp push`, cree un despliegue **Aplicacion web** con **Ejecutar como: yo** y limite **Quien tiene acceso** al dominio o grupo corporativo apropiado. No use acceso anonimo si los benchmarks no deben ser publicos. Consulte [WEB_APP.md](WEB_APP.md) para el despliegue y las rutas de validacion.

El acceso conectado durante esta construccion devolvio `403 PERMISSION_DENIED` para el Sheet destino; por eso la importacion y el despliegue vinculado deben hacerse con una cuenta que tenga permiso de edicion.

`outputs/commercial-strict/Markets_Commercial_WOW.xlsx` es una entrega Looker-ready para validar el contrato y las fuentes materializadas. El RUN real debe ejecutarse sobre el Sheet maestro, que conserva `RATINGS`, logs y alertas.

## Operacion

- Entrada unica: `runDailyRatingMonitor()`.
- Ejecucion manual: `runNow()`.
- Recalculo de ranking, ultimo dato y variacion a 30 dias: `rebuildAllMetrics()`.
- Validacion de contrato y catalogo: `validateProject()`.
- Instalacion idempotente del trigger: `setupProject()`.
- Precalentamiento manual del dashboard tras desplegar: `warmMarketsDashboardCache()`.

El monitor usa una clave determinista por fecha y app. Reejecutar el mismo dia actualiza el registro existente y no crea duplicados. Los fallos de una tienda no borran valores anteriores ni escriben ratings vacios. `IS_FRESH_THIS_RUN` y `FETCH_STATUS` impiden confundir un valor retenido con uno refrescado.

El ranking se calcula por plataforma, pais, segmento y fecha. Solo se publica si `RANKING_OBSERVED_APPS = RANKING_EXPECTED_APPS`; en caso contrario queda vacio y se informa `RANKING_COVERAGE`. Bancos y competidores digitales commercial nunca compiten en el mismo ranking.

## Cobertura geografica del PDF

El contrato cubre exclusivamente las ocho geografias con BBVA Empresas: `MX`, `PE`, `AR`, `UY`, `ES`, `CO`, `VE` y `TR`. Italia y Alemania quedan fuera del catalogo y de los datasets. Cada benchmark bancario contiene BBVA y cuatro competidores por plataforma. Android Mexico excluye `BANBAJIO` para mantener el Top 4 comparable del diseño.

Los paneles digitales solo incorporan productos con oferta oficial para empresas, autonomos o comercios: Mexico, Argentina, España y Colombia. Argentina contiene tres referencias: la ficha de Getnet ya no esta disponible de forma verificable en las tiendas y no se inventa un cuarto competidor. Cada fila digital exige `COMMERCIAL_ELIGIBLE`, URL oficial de producto, URL de tienda y fecha de verificacion.

## Comentarios y reseñas

`REVIEWS` se elimina del contrato y de la migracion activa. El proyecto no hace scraping de comentarios ni asigna una geografia inferida. Las APIs autorizadas de Google Play y App Store Connect solo permiten consultar comentarios de apps propias con credenciales del desarrollador; no resuelven un benchmark completo de competidores Android/iOS/Huawei. Hasta disponer de una fuente contractual y trazable, no se vuelcan comentarios.

## Venezuela

La migracion de esquema inserta, solo si no existen, BBVA y cuatro referencias de banca empresarial/digital para `VE`: Mercantil Empresas, Banesco VE, Bancaribe Empresas y BNC. Se incluyen identificadores verificados de Google Play, App Store y AppGallery.

AppGallery reconoce los paquetes, pero actualmente puede devolver `count = 0`; en ese caso Huawei queda vacio y el run se marca `PARTIAL`, nunca se escribe un rating cero.

## Rating consolidado

`APP_CATALOG.COUNTRY_PLATFORM_WEIGHT` representa el reparto Android/iOS/Huawei dentro de un pais. `GROUP_USER_WEIGHT` representa la proporcion de usuarios totales del grupo para esa combinacion pais/plataforma. El consolidado solo se publica cuando todos los pesos positivos tienen `WEIGHT_SOURCE`, `WEIGHT_EFFECTIVE_DATE` y rating para la fecha. Si falta cualquiera, el valor queda vacio. No se usan `RATING_COUNT` ni pesos iguales como sustitutos de usuarios.

## Escalabilidad

Para añadir una app o pais basta con añadir una fila valida en `APP_CATALOG`. Las columnas de `DASHBOARD_KPIS` se regeneran desde el catalogo; tras añadir un pais hay que refrescar los campos de la fuente en Looker Studio, pero no crear nuevas formulas ni filtros de scorecard. Para añadir otra plataforma se implementa un adaptador en `20_Adapters.gs` que devuelva el mismo contrato `{app, rating, ratingCount}`.

## Pruebas

```bash
npm test
```

Las pruebas cubren normalizacion, ranking con empates, observacion a 30 dias, estabilidad de claves, contrato geografico, correccion de meses y supresion de rankings incompletos.
