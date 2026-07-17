# Dashboard web de Markets Ratings

## Por que esta arquitectura

La interfaz se sirve desde el mismo Apps Script que actualiza el Google Sheet. `Index.html` usa `google.script.run`, por lo que no necesita publicar la hoja, gestionar CORS ni distribuir credenciales al navegador. El control de acceso es el del propio despliegue.

El backend evita enviar las 32k observaciones completas:

- `getMarketsDashboardBootstrap()` devuelve la ultima foto, metadatos, consolidados y 18 meses de tendencias BBVA.
- `getMarketsDashboardSnapshot(date)` lee solo el bloque de filas de la fecha pedida.
- `getMarketsDashboardTrends(filters)` devuelve series mensuales filtradas, con un maximo de 36 meses.
- `CacheService` conserva respuestas menores de 90 KB durante cinco minutos.

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

## Comprobaciones rapidas

Sobre la URL `/exec` del despliegue:

- Dashboard: `/exec`
- Bootstrap JSON: `/exec?api=bootstrap`
- Snapshot: `/exec?api=snapshot&date=2026-07-17`
- Tendencias: `/exec?api=trends&country=MX&platform=Android&segment=BANK&months=18`

Las rutas JSON heredan el mismo control de acceso. Si el despliegue se configura como publico, tambien lo seran esas respuestas.

## Comportamiento esperado

- Los rankings incompletos no se presentan como posiciones validas.
- Un rating ausente nunca se convierte en cero.
- El dashboard indica si el ultimo RUN fue `OK`, `PARTIAL` o `ERROR`.
- El rating consolidado solo aparece cuando existen pesos documentados y cobertura suficiente; en su defecto se etiqueta explicitamente una media observada.
- El layout se adapta a desktop, tablet y movil sin librerias externas.

## Operacion

El dashboard es de solo lectura. El trigger diario y `runNow()` siguen actualizando los datasets. La cache expira en cinco minutos, por lo que una ejecucion nueva puede tardar ese maximo en verse reflejada si ya habia una respuesta cacheada.
