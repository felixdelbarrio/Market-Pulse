# Market Pulse · Iteración 24

## Análisis mensual y anual

| Página | Implementación | Verificación |
| --- | --- | --- |
| 1 · Pulso mensual | Pulso, evolución por entidad, brecha, ejemplos y voz nueva se muestran en el orden solicitado. El NPS y la variación frente al mes calendario anterior se incorporan a cada celda del pulso y a su Excel. Móvil muestra el mes seleccionado y su anterior. Escritorio conserva seis cierres. | Pruebas de estructura, filtros y cálculo. Falta comprobar el ajuste visual en móvil conectado. |
| 2 · Análisis anual | Los títulos y el bloque destacado identifican el año cerrado o el acumulado hasta la fecha. El gráfico de NPS sigue el selector del gráfico de rating. Selecciona BBVA por defecto y compara las aplicaciones cuando el filtro del país lo permite. El Excel añade la serie anual de NPS. | Pruebas de cálculo con todas las estrellas y de independencia respecto del sentimiento del mapa. Falta medir en Apps Script. |

El rating consolidado usa los pesos del catálogo y, en su defecto, los volúmenes de valoraciones disponibles. Solo en ausencia de ambas bases se usa la media aritmética. El NPS de reseñas es el porcentaje de promotoras menos el de detractoras entre las reseñas válidas del mes. Dos meses se comparan cuando ambos tienen valor. El NPS reutiliza el RPC de reseñas de cada pantalla y el servidor devuelve los puntos agregados por mes en la misma respuesta. El índice de clasificación conserva su versión y las vistas publicadas cambian de esquema.

La recuperación manual de ratings se encola con el supervisor unificado. El monitor de salud pasa a la prioridad de mantenimiento, detrás de los trabajos elegibles de captura, envío, clasificación y publicación.

## Confirmaciones de España

El código reconoce una valoración directa de la aplicación que identifica expresamente el mercado español. Una mención de SEPA, una comparación entre países o la experiencia de un tercero requieren evidencia adicional. La confirmación de una reseña individual se guarda como una aprobación con huella del título y del texto, sin tocar su escaparate ni la reseña de origen.

Para aplicar las confirmaciones históricas, identificar las claves exactas de la auditoría y validar que siguen apuntando a las mismas reseñas. Después de comprobar las cabeceras, verificar el respaldo con `enableMarketsIteration23Geography`, configurar `MARKETS_GEO_SPAIN_CONFIRMATIONS` con el array JSON de clave y huella de cada reseña confirmada y ejecutar `applyMarketsSpainReviewApprovals` como propietario. La operación comprueba unicidad, ficha compartida elegible y conflictos con aprobaciones anteriores antes de escribir. Después, comparar las filas, comprobar la nueva revisión geográfica y verificar en Comentarios que cambia el país de esas claves y se conserva el total de reseñas.

## Promoción conjunta

Los cambios continúan en el [PR #48 hacia develop](https://github.com/felixdelbarrio/Market-Pulse/pull/48). [ITERACION_23.md](ITERACION_23.md) conserva la referencia de rendimiento y las comprobaciones pendientes de esa iteración. En esta sesión el conector del Sheet devolvió 403 y la edición del proyecto mediante el navegador integrado no estaba disponible. La aplicación histórica y la promoción conjunta requieren acceso al entorno y cotejar con los valores vigentes del Sheet las tres claves recuperadas del Excel. Ejecutar la matriz de aceptación y usar el despliegue de aplicación web existente con nueva versión y acceso corporativo.
