# Modelo para Looker Studio

## Fuente `DASHBOARD_KPIS` para scorecards

Esta es la fuente recomendada para la parte superior de **Competitive Overview**. Tiene una fila por fecha y campos directos como:

- `ANDROID_VE_BBVA_RATING`
- `IOS_VE_BBVA_DELTA_30D`
- `HUAWEI_VE_BBVA_RANKING`
- `BBVA_VE_CONSOLIDATED_RATING`
- `BBVA_GROUP_RATING`

Configure `OBSERVED_DATE` como dimension de intervalo de fechas y use cada campo directamente como metrica. No añada filtros `PLATFORM`, `COUNTRY_CODE`, `APP_NAME`, `IS_BBVA` ni `IS_LATEST` al scorecard: ya estan resueltos en el nombre del campo. Asi se eliminan los filtros persistentes por chart que originaban los 20 scorecards repetidos. El control de fecha puede seguir gobernando la pagina mediante `OBSERVED_DATE`, tal como admite Looker Studio para fuentes con una dimension de fecha.

Si el requisito visual es que no aparezca ningun icono de cabecera incluso cuando un control de fecha o una interaccion afecte al chart, configure **Style > Chart header > Do not show**. La tabla wide elimina los filtros de negocio del scorecard; ocultar la cabecera controla la presentacion del menu del chart.

Para una pantalla estrictamente diaria, configure el selector con inicio y fin en el mismo dia. Use agregacion `MAX` solo sobre ese unico dia; no use `MAX` sobre varios dias para intentar obtener el ultimo rating, porque una bajada posterior produciria un valor incorrecto.

Los campos `*_WEIGHT_COVERAGE` deben formatearse como porcentaje. Un consolidado vacio con cobertura inferior al 100% significa que faltan pesos configurados o ratings para alguna plataforma, no que el rating sea cero.

## Fuente `DASHBOARD_TRENDS` para evolucion

Use esta tabla para las graficas mensuales del PDF:

| Campo | Uso |
|---|---|
| `PERIOD_MONTH` | Dimension temporal |
| `PLATFORM`, `COUNTRY_CODE`, `APP_NAME`, `DISPLAY_ORDER` | Desgloses, controles y orden de competidores |
| `RATING_AVG` | Media de observaciones del mes |
| `RATING_EOM` | Ultima observacion disponible del mes |
| `RANKING_EOM`, `DELTA_30D_EOM` | Posicion y variacion al cierre mensual |

Esta fuente reduce el volumen para las pantallas de evolucion. Use `RATINGS` cuando necesite granularidad diaria.

## Fuente `RATINGS`

Conecte directamente la pestaña `RATINGS`, use la fila 1 como cabecera y asigne estos tipos:

| Campo | Tipo | Uso |
|---|---|---|
| `OBSERVED_DATE` | Fecha | Dimension temporal principal |
| `YEAR_MONTH` | Año mes | Evolucion mensual |
| `PLATFORM` | Texto | Android / iOS / Huawei |
| `COUNTRY_CODE`, `COUNTRY` | Geografico / texto | Selector y desglose por pais |
| `APP_NAME` | Texto | BBVA o competidor |
| `IS_BBVA`, `IS_LATEST` | Booleano | Filtros de scorecards |
| `RATING` | Numero decimal | Rating publico |
| `RATING_COUNT` | Numero entero | Volumen de valoraciones cuando la tienda lo publica |
| `RANKING` | Numero entero | Posicion dentro de plataforma, pais y fecha |
| `PREVIOUS_RATING_30D`, `DELTA_30D` | Numero decimal | Comparacion con la ultima observacion disponible hasta D-30 |

### Equivalencia con los paneles adjuntos

- **Rating por pais y sistema operativo**: filtro `IS_BBVA = TRUE` e `IS_LATEST = TRUE`; dimension `COUNTRY`, desglose `PLATFORM`, metrica `RATING`.
- **Variacion 30 dias**: misma seleccion y metrica `DELTA_30D`.
- **Ranking frente a competidores**: `IS_BBVA = TRUE`, `IS_LATEST = TRUE`, metrica `RANKING`.
- **Ranking detallado por pais**: `IS_LATEST = TRUE`; dimension `APP_NAME`, metricas `RATING` y `RANKING`, filtro por pais.
- **Evolucion consolidada BBVA**: `IS_BBVA = TRUE`; dimension `YEAR_MONTH`, desglose `COUNTRY` o `PLATFORM`, metrica promedio de `RATING`.
- **Evolucion de competidores**: dimension `OBSERVED_DATE`, desglose `APP_NAME`, filtro de pais y plataforma.

Los tres primeros bloques deben construirse preferentemente con `DASHBOARD_KPIS`; las equivalencias sobre `RATINGS` se conservan para auditoria y analisis ad hoc.

Use `RECORD_KEY` como identificador, no como dimension visible. Evite sumar `RATING`; use promedio, maximo o el valor de la fecha filtrada.

## Fuente `REVIEWS`

Conecte `REVIEWS` como segunda fuente:

- `REVIEW_DATE`: fecha y hora.
- `STAR_RATING`: numero entero/decimal entre 1 y 5.
- `APP_VERSION`: texto.
- `REVIEW_TEXT`, `TITLE`: texto.
- `TOPICS`: dimension preparada para una futura clasificacion; el historico migrado queda vacio.
- `REVIEW_KEY`: identificador deduplicado.

Permite reproducir evolucion por estrellas, tabla de reseñas, distribucion por version y analisis de texto. `REVIEWS` contiene datos personales publicos (nombre de usuario y texto); aplique los controles de acceso y retencion corporativos correspondientes.

## Controles recomendados

- Periodo de fechas.
- Pais.
- Plataforma.
- App / competidor.
- `IS_BBVA`.
- Rating por estrellas.
- Version de app.

Mantenga cada pagina conectada a una sola tabla cuando sea posible. Para cruzar rating y reseñas, agregue cada fuente por mes/plataforma/pais antes de combinar; no una las tablas a nivel de fila porque sus granularidades son distintas.
