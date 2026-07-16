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

