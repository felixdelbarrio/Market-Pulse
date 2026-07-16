# Modelo para Looker Studio

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

