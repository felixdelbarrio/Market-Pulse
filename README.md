# Markets Ratings Web App

Monitor de ratings publicos de Google Play, Apple App Store y Huawei AppGallery, servido como Google Apps Script Web App. El Google Sheet es el almacenamiento operativo; toda la experiencia de consulta vive en `src/Index.html` y `src/60_WebApp.gs`.

## Arquitectura activa

El libro maestro contiene ocho pestañas:

- `CONTROL`: parametros operativos.
- `APP_CATALOG`: apps, geografias, identificadores de tienda, pesos y evidencias.
- `RATINGS`: historico diario normalizado.
- `DASHBOARD_COMPETITION`: snapshots de rating, ranking, volumen, frescura y enlaces web de tienda.
- `DASHBOARD_TRENDS`: series mensuales compactas.
- `FETCH_LOG`: resultado de cada consulta por app.
- `ALERT_LOG`: alertas deduplicadas.
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
6. Ejecute `warmMarketsDashboardCache()` después de publicar una nueva version.

Un `clasp push` no cambia una version ya desplegada. Use **Gestionar implementaciones > Editar > Nueva version**.

## Operacion

- `runDailyRatingMonitor()`: entrada diaria unica.
- `runNow()`: ejecucion manual.
- `rebuildAllMetrics()`: recalcula ranking, variaciones y datasets compactos sin consultar las stores.
- `validateProject()`: valida catalogo y contrato.
- `setupProject()`: inicializacion e instalacion idempotente del trigger.
- `warmMarketsDashboardCache()`: reconstruccion manual de cache compartida.

La cache tiene dos niveles: `CacheService` para acceso rapido y `PropertiesService` para persistencia compartida comprimida. Cada RUN reemplaza la generacion despues de actualizar los datasets. Si falla, se invalida para que la siguiente peticion reconstruya desde Sheets.

Los enlaces de Android, iOS y Huawei se generan como HTTPS web con geografia explicita, se validan contra dominios oficiales y se abren en otra pestaña. Esto se aplica tanto a BBVA como a la competencia.

`Resumen` y `Evolucion` mantienen siempre el foco en BBVA Empresas y su universo bancario comparable. El selector `Benchmark` solo aparece en la vista de rankings, donde permite comparar BBVA con bancos, fintech y neobancos o todo el mercado. Cada fila del ranking es un enlace completo a la ficha web oficial de la app.

El volumen de Google Play se gobierna por `packageName`: si el mismo package esta activo en varios paises, sus valoraciones y su variacion a 30 dias representan una unica ficha compartida. El Web App las contabiliza una sola vez en los KPI y no las atribuye a las tarjetas geograficas. Un package exclusivo de un pais —como el Android de Mexico— conserva alcance de mercado. iOS y Huawei mantienen alcance territorial.

## Reglas de datos

- Ratings validos: escala publica 1–5; una ausencia nunca se convierte en cero.
- Ranking: solo se publica con cobertura completa del conjunto esperado.
- Reejecucion diaria: actualiza por clave determinista y no duplica observaciones.
- Fallos de store: conservan el historico y quedan trazados en `FETCH_LOG`.
- Consolidados: requieren pesos positivos, fuente, fecha efectiva y cobertura completa.
- Cobertura: compara observaciones publicadas con todas las apps activas esperadas en `APP_CATALOG`.
- Comentarios y reseñas: fuera de alcance mientras no exista una fuente autorizada y geograficamente comparable.

## Pruebas

```bash
npm test
```

La suite cubre adaptadores, normalizacion, ranking, variacion y volumen a 30 dias, materializaciones, consolidados, cache persistente, URLs oficiales y compilacion del HTML.

Consulte [WEB_APP.md](WEB_APP.md) para detalles del despliegue y comportamiento de cache.
