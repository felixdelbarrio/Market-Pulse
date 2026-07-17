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
- `Resumen` y `Evolucion` solicitan siempre series `BANK` centradas en BBVA Empresas. El selector de universo competitivo solo se muestra en `Benchmark` y sus cambios no invalidan ni solicitan tendencias.
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

## Comprobacion rapida

Abra la URL `/exec` del despliegue y confirme que la cabecera muestra la revision actual, las tarjetas aparecen sin espera adicional y los filtros actualizan las tendencias.

## Comportamiento esperado

- Los rankings incompletos no se presentan como posiciones validas.
- Un rating ausente nunca se convierte en cero.
- El dashboard indica si el ultimo RUN fue `OK`, `PARTIAL` o `ERROR`.
- Las incidencias muestran pais, plataforma, app, estado y detalle del `FETCH_LOG` del ultimo RUN.
- Los totales acumulados y del periodo usan `RATING_COUNT` y su variacion real a 30 dias, deduplicados por la identidad territorial o compartida de cada ficha.
- El informe completo se exporta mediante la impresion PDF nativa, incluyendo graficos SVG y benchmarks.
- El rating consolidado solo aparece cuando existen pesos documentados y cobertura suficiente; en su defecto se etiqueta explicitamente una media observada.
- El layout se adapta a desktop, tablet y movil sin librerias externas.

## Operacion

El dashboard es de solo lectura. El trigger diario y `runNow()` siguen actualizando los datasets. Al terminar, el RUN construye una generacion nueva, cambia el puntero persistente de forma atomica y elimina la anterior. Si L1 caduca, se repone desde L2 sin abrir el spreadsheet. Si la materializacion falla, ambas capas se invalidan para que la siguiente peticion reconstruya desde Google Sheets en lugar de servir una revision antigua.
