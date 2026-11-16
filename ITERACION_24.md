# Market Pulse · Iteración 24

## Análisis mensual y anual

| Página | Implementación | Verificación |
| --- | --- | --- |
| 1 · Pulso mensual | Pulso, evolución por entidad, brecha, ejemplos y voz nueva se muestran en el orden solicitado. El NPS y la variación frente al mes calendario anterior se incorporan a cada celda del pulso y a su Excel. Móvil muestra el mes seleccionado y su anterior. Escritorio conserva seis cierres. | Pruebas de estructura, filtros y cálculo. Falta comprobar el ajuste visual en móvil conectado. |
| 2 · Análisis anual | Los títulos y el bloque destacado identifican el año cerrado o el acumulado hasta la fecha. El gráfico de NPS sigue el selector del gráfico de rating. Selecciona BBVA por defecto y compara las aplicaciones cuando el filtro del país lo permite. El Excel añade la serie anual de NPS. | Pruebas de cálculo con todas las estrellas y de independencia respecto del sentimiento del mapa. Falta medir en Apps Script. |

El rating consolidado usa los pesos del catálogo y, en su defecto, los volúmenes de valoraciones disponibles. Solo en ausencia de ambas bases se usa la media aritmética. El NPS de reseñas es el porcentaje de promotoras menos el de detractoras entre las reseñas válidas del mes. Dos meses se comparan cuando ambos tienen valor. El NPS reutiliza el RPC de reseñas de cada pantalla y el servidor devuelve los puntos agregados por mes en la misma respuesta. El índice de clasificación conserva su versión y las vistas publicadas cambian de esquema.

La recuperación manual de ratings se encola con el supervisor unificado. El monitor de salud pasa a la prioridad de mantenimiento, detrás de los trabajos elegibles de captura, envío, clasificación y publicación.

## Confirmaciones de España

El código reconoce una valoración directa de la aplicación que identifica expresamente el mercado español. En la ficha compartida de BBVA Empresas, el uso directo de adeudos SEPA se atribuye a España mientras la ficha se limite a los mercados comprobados AR, CO, ES, PE y UY. Una mención genérica a SEPA, una comparación entre países o la experiencia de un tercero requiere evidencia adicional. La confirmación de una reseña individual se guarda como una aprobación con huella del título y del texto, sin tocar su escaparate ni la reseña de origen.

Para aplicar las confirmaciones históricas, identificar las claves exactas de la auditoría y validar que siguen apuntando a las mismas reseñas. Después de comprobar las cabeceras, verificar el respaldo con `enableMarketsIteration23Geography`, configurar `MARKETS_GEO_SPAIN_CONFIRMATIONS` con el array JSON de clave y huella de cada reseña confirmada y ejecutar `applyMarketsSpainReviewApprovals` como propietario. La operación comprueba unicidad, ficha compartida elegible y conflictos con aprobaciones anteriores antes de escribir. Después, comparar las filas, comprobar la nueva revisión geográfica y verificar en Comentarios que cambia el país de esas claves y se conserva el total de reseñas.

## Promoción conjunta

Los cambios continúan en el [PR #48 hacia develop](https://github.com/felixdelbarrio/Market-Pulse/pull/48). [ITERACION_23.md](ITERACION_23.md) conserva la referencia de rendimiento y la matriz de verificación. En el navegador integrado se comprobó el proyecto remoto, la versión web anterior 85 y su acceso corporativo. Los 16 archivos intervenidos coincidían con `develop` antes de guardar el candidato `bca8619`.

El 16 de noviembre, en hora de Madrid, Apps Script verificó el respaldo a las 17:50. Las huellas calculadas desde el Excel no coincidieron con las del servicio. Se compararon los títulos y textos vivos con el Excel en las tres claves únicas. Se generaron las huellas desde las celdas verificadas y se aplicaron tres aprobaciones ES con lectura posterior, a las 17:56. Se completó el índice de 81.410 reseñas a las 17:58. El Pulso móvil mostró dos meses y 356 píxeles de contenido en un contenedor de 356 píxeles con un viewport de 390.

A las 18:01 se generaron 67 vistas precalculadas. Apps Script actualizó el despliegue web existente a la versión **86** a las 18:03, con acceso BBVA y ejecución como propietario. Se retiraron del editor las funciones temporales de verificación y se comprobó que los 16 archivos guardados coinciden con el commit. La URL pública mostró la versión web `2026.11.16.80`, seis observaciones en el Pulso mensual y once puntos del NPS anual para España. El refresco de metadatos Android figura programado a las 18:00 en el supervisor unificado. Quedan por medir percentiles de producción con una muestra representativa de filtros y verificar resultados de ejecución del nuevo trabajo Android.

El panel de producción confirmó el índice completo y el inicio del recorrido geográfico por lotes para 7.275 reseñas elegibles. El primer lote todavía no había llegado a las filas compartidas al cerrar la verificación. El refresco Android quedó pendiente de turno. La generación manual de vistas duró 141 segundos en segundo plano. Esta duración no mide la latencia de una consulta interactiva.
