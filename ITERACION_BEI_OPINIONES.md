# Audiencia, clasificación funcional y NPS de opiniones

La audiencia se decide en `queryMarketsReviews_` sobre el título y texto originales, después de deduplicar y aplicar el alcance y antes de paginar o agregar. La traducción disponible se usa para mostrar la reseña. El catálogo sigue siendo `FUNCTIONAL_CATALOG`; los bloques .xx son el fallback existente y solo habilitan la marca de operativa compartida si el bloque está activo. La consulta, la caché, la exportación y los cálculos usan el mismo filtro. Todos conserva el universo y es el valor inicial. Los cambios de geografía desde las pestañas de Comentarios restablecen Todos; el diálogo aplica conjuntamente los filtros elegidos.

| Familia | IDs del catálogo / bloque | Señal y precedencia | Ejemplo y decisión |
| --- | --- | --- | --- |
| Cuentas | 02.02, 02.03, 02.14, 02.xx | Operación compartida; cuenta empresarial propia es directa; cuenta sueldo es retail (ES/EN/PT/TR) | «Cuenta de nómina», «maaş hesabı»: solo Todos; «mi cuenta no funciona»: extendido |
| Pagos y nóminas | 03.13, 03.18, 03.25, 03.xx; 04.xx | Transferencia compartida; nóminas del empleador son directas; el cobro de sueldo no activa nóminas (ES/EN/PT/TR) | «Pago de nóminas»: ambos filtros BEI; «Havale yapamıyorum»: extendido |
| Impuestos, recibos y cobros | 05.01, 05.23, 05.xx, 06.01, 06.03, 06.06, 06.09, 06.xx, 07.02; 11.xx | Operaciones compartidas; IVA del negocio y pago a proveedores son directos; POS requiere contexto de comercio y una mención a secas no vale (ES/EN/TR) | «Pagar mis impuestos»: extendido; «IVA de mi negocio»: ambos |
| Financiación y avales | 08.12, 08.24, 08.33, 08.xx | Préstamo sin finalidad explícita: compartido; comercial: directo; consumo/personal: retail (ES/EN/TR) | «İhtiyaç kredisi»: solo Todos |
| Tarjetas | 09.xx y operaciones explícitas del bloque 09 | Tarjeta sin titularidad: compartida; corporativa: directa; estudiante/personal: retail (ES/EN/TR) | «Mi tarjeta de empresa»: ambos; «tarjeta de estudiante»: solo Todos |
| Divisas, inversión y seguros | 10.05, 12.04, 12.05, 12.xx, 14.xx | Operaciones explícitas compartidas; seguro del comercio: directo; seguro de hogar: retail | «Mi seguro de hogar»: solo Todos |
| Seguridad y justificantes | 15.19, 16.03, 16.05, 16.08 | Capacidad bancaria identificada: compartida; acceso genérico no basta (ES/EN/TR) | «OTP para aprobar pagos»: extendido; «no puedo entrar en la app»: solo Todos |

La lista exacta de operaciones y las señales se versionan con la caché de reseñas. Una señal directa tiene mayor confianza que una contextual; las señales opuestas directas y retail dejan la audiencia indeterminada y fuera de ambos filtros BEI. No se infiere audiencia de nombres de apps ni países. Quedan sin calibrar, entre otros, negaciones complejas, citas, usos de terceros, variaciones regionales y expresiones turcas que no cubren los ejemplos. No se crean productos o suboperativas para rellenar esos huecos.

## News Radar

Revisado el código de `develop` en `1a81ada`. `src/server/news/Rules.gs` aplica contexto empresarial, canal y exclusiones; `src/server/news/TaxonomyJobs.gs::taxonomyRecord_` llama a `src/shared/taxonomy.js::taxonomyDecision`. Este último combina candidatos literales con descripciones ponderadas por IDF, contexto mínimo de tres términos, umbral semántico de 0,5 y margen de ambigüedad del 85 % para candidatos semánticos. Por separado, `taxonomyObserve` y `taxonomyBuild` acumulan frecuencia, coocurrencias y pesos TF-IDF de las asignaciones del corpus; el código actual de `taxonomyBuild` devuelve las entradas de regla. El editor remoto muestra el mismo núcleo de ranking; no se cotejaron todas las fuentes ni la versión desplegada. `tests/canonical-taxonomy.test.mjs` y `tests/taxonomy.test.mjs` cubren la taxonomía.

| Mecanismo | Adaptación en Market Pulse | Riesgo |
| --- | --- | --- |
| Alias y frases canónicas, contexto y exclusiones | Índice invertido de frases y contexto; se pondera la evidencia independiente con IDF y se descartan empates entre bloques | Frases breves y abreviadas dan menos evidencia |
| Normalización y fallback por evidencia discriminante | Se normalizan ambas formas de i turca; los bloques solo cuentan si están en el catálogo | La normalización no es un analizador morfológico |
| Ponderación semántica y TF-IDF | IDF suavizado del catálogo vigente, TF logarítmica de la reseña y cobertura de la descripción. Solo como fallback, con tres términos raros, cobertura mínima y margen del 85 %. Se consultan solo los candidatos del índice invertido | Umbrales de partida procedentes de News Radar; falta calibrarlos con una muestra de reseñas etiquetada |
| Biblioteca compartida | Sería viable extraer un núcleo puro y versionado, con clasificación en lotes y sin acceso a Sheets, Gmail ni OAuth. Esta entrega no añade una dependencia remota ni modifica News Radar | Una biblioteca del proyecto completo acoplaría versiones y permisos; una API remota añadiría latencia, cuotas y un punto de fallo |
| Geografía | Se usa la atribución vigente de Market Pulse | Una geografía compuesta sigue contando una sola vez según el contrato vigente |

## Datos y validación

La suma de GEOGRAFIAS (12 filas) coincide con APLICACIONES (99 filas): 68.513 en total, 2.395 BEI candidatos, 14.084 compartidos, 56 retail, 4 conflictos y 51.974 sin señal. Se reprodujeron las sumas del Excel, no un recuento de filas individuales del Sheet. La muestra de 478 está marcada íntegramente como PENDIENTE. La revisión puntual detectó una cuenta sueldo turca entre los candidatos BEI y pagos de nómina en geografía compuesta entre los candidatos compartidos. Los casos se incluyeron como regresiones; la muestra no permite afirmar precisión, recall ni una mejora por aplicación. El adjunto no incluye la hoja de casos TR mencionada en la propuesta ni el archivo de datos brutos.

`processMarketsReviewTranslations_` procesa hasta 100 filas por lote y durante 235 segundos; conserva escrituras parciales y espera una hora al detectar cuota agotada. `superviseMarketsReviews_` retoma pendientes y registra fallos repetidos. El 14/11/2026 se observaron tres ejecuciones recientes del supervisor completadas. No había registros de Cloud disponibles en la última ejecución inspeccionada. No se confirmó avance de traducciones, edad de pendientes ni cuota diaria efectiva. No se cambiaron ni ejecutaron los jobs.

El NPS usa 5 estrellas como promotoras, 4 neutras y 1–3 detractoras. Compara el mes elegido hasta su cierre o hasta hoy inclusive, con el mes calendario anterior completo; devuelve N/D sin opiniones válidas y expresa el delta en puntos. Los filtros de sentimiento de brechas y ejemplos no alteran el denominador del NPS general.

No hay backfill persistente ni cambios en el Sheet. Las nuevas reglas se aplican en lectura y el esquema de caché se incrementa para descartar resultados previos. Volver a la versión anterior de la aplicación revierte la clasificación sin migrar datos. Los recuentos filtrados necesitan leer originales antes de paginar; la latencia con los datos de producción queda pendiente de medir.
