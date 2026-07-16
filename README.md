# Markets Ratings

Proyecto unico para monitorizar ratings publicos de Google Play, Apple App Store y Huawei AppGallery en un solo Google Sheet y servirlos a Looker Studio.

## Resultado

El libro maestro contiene ocho pestañas:

- `CONTROL`: parametros operativos y contrato de version.
- `APP_CATALOG`: catalogo normalizado de plataforma, pais, app e identificadores de tienda.
- `RATINGS`: fuente principal de Looker Studio, una fila por fecha/plataforma/pais/app.
- `DASHBOARD_KPIS`: fuente wide precalculada, una fila por fecha y campos directos por pais/plataforma para scorecards sin filtros de chart.
- `DASHBOARD_TRENDS`: agregacion mensual compacta para las pantallas de evolucion.
- `REVIEWS`: historico unificado de reseñas de Android e iOS; Huawei queda preparado para una futura ingesta.
- `ALERT_LOG`: alertas historicas y nuevas alertas deduplicadas.
- `RUN_LOG`: trazabilidad de migraciones y ejecuciones.

Las antiguas pestañas por pais, `ALL`, `MONTHLY_ALL`, `Resumen` y `ALL_BANCO_*` no se copian: eran vistas derivadas y duplicaban los mismos datos. La tabla larga `RATINGS` permite reconstruirlas con filtros, tablas y graficos de Looker Studio.

## Puesta en marcha

1. En el Google Sheet `1IkJgvM2imxm3r1x092q5dqpThrlnDoZ-5QvH8n2h2oQ`, use **Archivo > Importar > Subir > Reemplazar hoja de calculo** con `outputs/019f6ac2/MARKETS_RATINGS_MASTER.xlsx`.
2. Abra **Extensiones > Apps Script** en ese mismo Sheet.
3. Copie los archivos de `src/` o desplieguelos con `clasp`:

   ```bash
   cp .clasp.json.example .clasp.json
   # Sustituir REPLACE_WITH_BOUND_APPS_SCRIPT_ID por el ID del proyecto vinculado.
   clasp push
   ```

4. Ejecute `validateProject()` y revise el objeto devuelto.
5. Ejecute `runNow()` con `SEND_ALERT_EMAILS = FALSE`. La primera ejecucion migra las cabeceras de forma append-only, incorpora el catalogo inicial de Venezuela y materializa los datasets de dashboard.
6. Compruebe una nueva fila en `RUN_LOG`, ratings del dia en `RATINGS`, filas en `DASHBOARD_KPIS` y `DASHBOARD_TRENDS`, y ausencia de errores.
7. Ejecute `setupProject()` para instalar el trigger diario. Active `SEND_ALERT_EMAILS` solo tras validar destinatarios y umbrales.

El acceso conectado durante esta construccion devolvio `403 PERMISSION_DENIED` para el Sheet destino; por eso la importacion y el despliegue vinculado deben hacerse con una cuenta que tenga permiso de edicion.

## Operacion

- Entrada unica: `runDailyRatingMonitor()`.
- Ejecucion manual: `runNow()`.
- Recalculo de ranking, ultimo dato y variacion a 30 dias: `rebuildAllMetrics()`.
- Validacion de contrato y catalogo: `validateProject()`.
- Instalacion idempotente del trigger: `setupProject()`.

El monitor usa una clave determinista por fecha y app. Reejecutar el mismo dia actualiza el registro existente y no crea duplicados. Los fallos de una tienda no borran valores anteriores ni escriben ratings vacios. Los datasets de dashboard se reconstruyen de forma determinista despues de actualizar las metricas.

## Venezuela

La migracion de esquema inserta, solo si no existen, BBVA y cuatro referencias de banca empresarial/digital para `VE`: Mercantil Empresas, Banesco VE, Bancaribe Empresas y BNC. Se incluyen identificadores verificados de Google Play, App Store y AppGallery.

AppGallery reconoce los paquetes, pero actualmente puede devolver `count = 0`; en ese caso Huawei queda vacio y el run se marca `PARTIAL`, nunca se escribe un rating cero.

## Rating consolidado

`APP_CATALOG.COUNTRY_PLATFORM_WEIGHT` representa el reparto Android/iOS/Huawei dentro de un pais. `GROUP_USER_WEIGHT` representa la proporcion de usuarios totales del grupo para esa combinacion pais/plataforma. El consolidado solo se publica cuando todos los pesos positivos configurados tienen rating para la fecha. Si faltan pesos o datos, el valor queda vacio y el campo `*_WEIGHT_COVERAGE` muestra la cobertura. No se usan `RATING_COUNT` ni pesos iguales como sustitutos de usuarios.

## Escalabilidad

Para añadir una app o pais basta con añadir una fila valida en `APP_CATALOG`. Las columnas de `DASHBOARD_KPIS` se regeneran desde el catalogo; tras añadir un pais hay que refrescar los campos de la fuente en Looker Studio, pero no crear nuevas formulas ni filtros de scorecard. Para añadir otra plataforma se implementa un adaptador en `20_Adapters.gs` que devuelva el mismo contrato `{app, rating, ratingCount}`.

## Pruebas

```bash
npm test
```

Las pruebas cubren normalizacion de ratings, ranking con empates, busqueda de la observacion a 30 dias y estabilidad de claves.
