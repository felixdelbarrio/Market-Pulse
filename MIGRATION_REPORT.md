# Informe de migracion

Fecha de construccion: 2026-07-16.

## Datos conservados

| Conjunto | Filas unicas |
|---|---:|
| Catalogo de apps | 106 |
| Ratings Android | 15.790 |
| Ratings iOS | 14.764 |
| Ratings Huawei | 1.734 |
| Ratings totales | 32.288 |
| Reseñas Android + iOS deduplicadas | 1.439 |
| Alertas historicas | 679 |

- Rango de ratings: 2025-01-01 a 2026-07-16.
- Rango de reseñas: 2021-11-17 a 2026-05-09.
- Huawei solo aportaba histórico efectivo en Colombia; las demas hojas contenian cabeceras sin observaciones.
- Las reseñas duplicadas entre `REVIEWS` y `GET_OPINION`, o repetidas artificialmente entre paises, se deduplicaron por plataforma y `reviewId`, prefiriendo `GET_OPINION`.
- Se descartaron ratings nulos, cero o fuera de la escala publica 1-5. No se inventaron ceros para datos ausentes.
- Los identificadores, nombres y paquetes se conciliaron contra los tres catalogos de Apps Script existentes.

## Pestañas no migradas como tablas independientes

`ALL`, `MONTHLY_ALL`, `Resumen`, `ALL_BANCO_*` y las hojas por pais eran transformaciones del mismo histórico. Su contenido queda representado sin perdida semantica en `RATINGS`, con campos preparados para las vistas de Looker Studio.

Los logs operativos vacios no generaron filas; `RUN_LOG` incluye una ejecucion `MIGRATED` como punto de control.

## Refactor geografico 2026.07.16.3

- Italia y Alemania en Android, iOS y Huawei.
- Separacion de `BANK`, `FINTECH` y `NEOBANK` con conjuntos versionados.
- `YEAR_MONTH` siempre deriva de `OBSERVED_DATE`; la fuente mensual pasa de 1.237 a 1.171 filas validas.
- Ranking vacio si la cobertura es inferior al 100%.
- `FETCH_LOG`, `RUN_ID`, estado de fetch y frescura del dato.
- Banbajio desactivado en Android Mexico para mantener BBVA + Top 4.
- Pesos deliberadamente vacios hasta recibir fuente interna y fecha efectiva.

## Contrato commercial estricto 2026.07.16.4

- Italia y Alemania eliminadas: BBVA Empresas no opera en esas geografias del alcance.
- Competidores retail-only eliminados y sustituidos por productos con oferta empresarial oficial.
- Cada competidor digital incorpora evidencia de producto, ficha de tienda y fecha de verificacion.
- `REVIEWS` eliminado: no se publican comentarios sin API autorizada, competencia comparable y geografia demostrable.
