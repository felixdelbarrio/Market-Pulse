# Dashboard web de Markets Ratings

## Por que esta arquitectura

La interfaz se sirve desde el mismo Apps Script que actualiza el Google Sheet. `Index.html` usa `google.script.run`, por lo que no necesita publicar la hoja, gestionar CORS ni distribuir credenciales al navegador. El control de acceso es el del propio despliegue.

El backend evita enviar las 32k observaciones completas:

- `getMarketsDashboardBootstrap()` devuelve la ultima foto, metadatos, consolidados, incidencias y logos disponibles.
- `getMarketsDashboardTrends(filters)` devuelve series mensuales filtradas, con un maximo de 36 meses.
- `CacheService` actua como nivel rapido L1 durante seis horas y se comparte entre todos los usuarios.
- `PropertiesService` conserva como nivel L2, sin caducidad, el bootstrap y hasta 36 meses de tendencias, comprimidos y divididos en bloques seguros.
- La foto ejecutiva se pinta primero y las tendencias se solicitan en segundo plano.
- El snapshot mas reciente se localiza leyendo solo el final de `DASHBOARD_COMPETITION`, no sus 32k fechas.
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

## Comprobaciones rapidas

Sobre la URL `/exec` del despliegue:

- Dashboard: `/exec`
- Bootstrap JSON: `/exec?api=bootstrap`
- Tendencias: `/exec?api=trends&country=MX&platform=Android&segment=BANK&months=18`

Las rutas JSON heredan el mismo control de acceso. Si el despliegue se configura como publico, tambien lo seran esas respuestas.

## Comportamiento esperado

- Los rankings incompletos no se presentan como posiciones validas.
- Un rating ausente nunca se convierte en cero.
- El dashboard indica si el ultimo RUN fue `OK`, `PARTIAL` o `ERROR`.
- Las incidencias muestran pais, plataforma, app, estado y detalle del `FETCH_LOG` del ultimo RUN.
- Los totales acumulados y del periodo usan `RATING_COUNT` y su variacion real a 30 dias.
- El informe completo se exporta mediante la impresion PDF nativa, incluyendo graficos SVG y benchmarks.
- El rating consolidado solo aparece cuando existen pesos documentados y cobertura suficiente; en su defecto se etiqueta explicitamente una media observada.
- El layout se adapta a desktop, tablet y movil sin librerias externas.

## Operacion

El dashboard es de solo lectura. El trigger diario y `runNow()` siguen actualizando los datasets. Al terminar, el RUN construye una generacion nueva, cambia el puntero persistente de forma atomica y elimina la anterior. Si L1 caduca, se repone desde L2 sin abrir el spreadsheet. Si la materializacion falla, ambas capas se invalidan para que la siguiente peticion reconstruya desde Google Sheets en lugar de servir una revision antigua.
