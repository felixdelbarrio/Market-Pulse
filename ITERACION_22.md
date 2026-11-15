# Market Pulse · Iteración 22

Comparación local del 15 de noviembre de 2026 sobre `develop`, con base `178c7d8`.

| Objetivo | Implementado y comprobado localmente | Producción |
| --- | --- | --- |
| Filtro BEI y reproceso del índice | Selector único, compatibilidad de filtros antiguos, evidencia y relevancia versionadas. Dry run del corpus completo y pruebas de migración, reanudación y paridad | v80. Índice reconstruido y conciliado con 77.264 claves |
| Geografía Android | Título y cuerpo, contactos localizados, conflictos y revocación automática. Pruebas de lotes, manuales y consumidores | v80. 6.854 evaluadas, 37 atribuidas y 141 atribuciones automáticas revocadas |
| Correos en modo oscuro | Alertas, newsletter y salud con colores explícitos. Pruebas de render y MIME | v80. Validación visual pendiente en clientes móviles |
| Feedback y accesos | Identidad autenticada, cabeceras aditivas, visualización, reintento e idempotencia | v80. Feedback histórico comprobado. Migración en primera escritura autenticada. Alta de feedback y clic firmado sin prueba productiva |
| Análisis mensual | Orden de los cinco bloques comprobado en dos tamaños. Pruebas de selección y volúmenes geográficos | v80. Orden comprobado con datos reales |
| Entrega | Suite local con 173 aprobadas y 0 fallidas. Informe y secuencia operativa | Aplicación web activa en v80. PR #44 abierto |

## BEI · dry run del corpus

Se ejecutaron las reglas de `develop` y de Iteración 22 sobre el campo **Texto original** del XLSX definitivo, sin traducciones como entrada de decisión. Se leyeron **16.330 reseñas** con **0 claves duplicadas**. El XLSX exporta un único campo de texto original y no permite conciliar el título y el cuerpo por separado. En ejecución, el mismo extractor usa ambos campos para el índice y para el cálculo en vivo.

Antes, **Solo BEI** incluía 17 y **BEI extendido** 1.467. El nuevo filtro **BEI** incluye **1.437**, con 972 inclusiones nuevas, 1.002 exclusiones nuevas y 465 coincidencias que permanecen. La audiencia anterior se ejecutó desde el código base. Las etiquetas de la auditoría son prioridades heurísticas.

En la tabla, **audiencia antes** enumera empresa / personal / desconocida. **Audiencia después** enumera empresa / personal / mixta / desconocida. **Relevancia después** enumera empresarial / transversal / ninguna / dudosa. El movimiento de filtro compara BEI extendido con BEI.

| País · aplicación · plataforma | Reseñas | Audiencia antes | Audiencia después | Relevancia después | Incluidas antes → después | Altas / bajas |
| --- | ---: | --- | --- | --- | ---: | ---: |
| ES · CaixaBank (Now) · Android | 2.179 | 3 / 11 / 2.165 | 3 / 8 / 0 / 2.168 | 3 / 196 / 1.784 / 196 | 66 → 199 | 152 / 19 |
| ES · CaixaBank (Now) · iOS | 1.031 | 0 / 2 / 1.029 | 0 / 2 / 0 / 1.029 | 0 / 13 / 968 / 50 | 17 → 13 | 7 / 11 |
| TR · Akbank Kurumsal · Android | 2.010 | 3 / 62 / 1.945 | 4 / 49 / 1 / 1.956 | 4 / 200 / 1.190 / 616 | 243 → 204 | 136 / 175 |
| TR · Akbank Kurumsal · iOS | 504 | 0 / 5 / 499 | 0 / 4 / 0 / 500 | 0 / 36 / 314 / 154 | 56 → 36 | 22 / 42 |
| TR · BBVA · Android | 2.190 | 1 / 119 / 2.070 | 1 / 103 / 0 / 2.086 | 1 / 167 / 1.612 / 410 | 249 → 168 | 104 / 185 |
| TR · BBVA · iOS | 582 | 1 / 33 / 548 | 1 / 31 / 0 / 550 | 1 / 26 / 444 / 111 | 61 → 27 | 6 / 40 |
| TR · Halkbank Kobi · Android | 1.988 | 1 / 52 / 1.935 | 1 / 58 / 0 / 1.929 | 1 / 325 / 1.018 / 644 | 232 → 326 | 227 / 133 |
| TR · Halkbank Kobi · iOS | 505 | 5 / 18 / 482 | 5 / 18 / 0 / 482 | 5 / 125 / 179 / 196 | 109 → 130 | 74 / 53 |
| TR · Isbank Commercial · Android | 2.179 | 0 / 42 / 2.137 | 0 / 31 / 0 / 2.148 | 0 / 213 / 1.622 / 344 | 112 → 213 | 174 / 73 |
| TR · Isbank Commercial · iOS | 569 | 1 / 21 / 547 | 1 / 20 / 0 / 548 | 1 / 25 / 412 / 131 | 47 → 26 | 16 / 37 |
| TR · Yapi Kredi Kurumsal · Android | 2.074 | 2 / 50 / 2.022 | 1 / 38 / 0 / 2.035 | 1 / 77 / 1.638 / 358 | 189 → 78 | 51 / 162 |
| TR · Yapi Kredi Kurumsal · iOS | 519 | 0 / 20 / 499 | 0 / 20 / 0 / 499 | 0 / 17 / 364 / 138 | 86 → 17 | 3 / 72 |
| **Total** | **16.330** | 17 / 435 / 15.878 | 17 / 382 / 1 / 15.930 | 17 / 1.420 / 11.545 / 3.348 | **1.467 → 1.437** | **972 / 1.002** |

| Prioridad del XLSX | Filas evaluadas | Incluidas antes → después | Altas / bajas | Empresarial / transversal / ninguna / dudosa |
| --- | ---: | ---: | ---: | ---: |
| P1 | 313 | 8 → 18 | 14 / 4 | 0 / 18 / 248 / 47 |
| P2 | 4.717 | 637 → 574 | 427 / 490 | 0 / 574 / 2.304 / 1.839 |
| P3 | 11.300 | 822 → 845 | 531 / 508 | 17 / 828 / 8.993 / 1.462 |

Motivos finales · `insufficient_evidence` 11.162, `insufficient_context` 3.348, `shared_banking` 1.420, `personal_use` 382, `business` 17, `mixed_account_context` 1.

Se contrastaron ejemplos de cambios P1/P2 con el contexto original. «Çalışanlarınız çok nazik» alaba al personal del banco. «Şirket haberleri» alude a información bursátil y no prueba actividad del autor. «Maaşımı buradan alıyorum» y «aile kartı» identifican uso personal. «Ticari faaliyet gösteriyorum» y una tarjeta de crédito comercial propia entran como empresariales. Una incidencia concreta de inicio de sesión entra como transversal y conserva audiencia desconocida. El caso del alta personal que abre una cuenta comercial queda como mixto sin relevancia BEI confirmada. Las incidencias operativas ambiguas permanecen como dudosas. El repaso contextual fue por muestras, sin adjudicación humana exhaustiva ni estimación de precisión o recall.

Los siete campos históricos de `MARKET_REVIEW_INDEX` mantienen sus posiciones. Se añaden `relevance` y `evidence`. La versión de las reglas forma parte del digest del clasificador y del espacio de claves de caché. El cursor se reinicia por versión, el trabajador reutiliza filas con digest y versión válidos, y el lector clasifica en vivo cuando falta la decisión derivada válida.

## Geografía Android

El corpus carece de package ID, escaparates y respuestas de soporte por reseña. La comparación controlada utiliza una ficha Android compartida simulada, con las mismas entradas en el código de `develop` y en Iteración 22. De 12 casos, la atribución baja de 8 a 5. Los casos sin país pasan de 4 a 7, incluidos 2 conflictos explícitos. El desglose por aplicación de las atribuciones anteriores no se capturó antes de reprocesar.

| Caso Android compartido | Antes | Después |
| --- | --- | --- |
| Título con residencia propia | UNKNOWN · SIN_EVIDENCIA | ES · personal-location |
| Soporte local ES | ES · support-es | ES · support-es |
| Soporte local CO | CO · support-co | CO · support-co |
| Plantilla de agradecimiento | CO · support-co-template | UNKNOWN · SIN_EVIDENCIA |
| Teléfono incidental | ES · support-es | UNKNOWN · SIN_EVIDENCIA |
| SEPA sin país | ES · own-sepa-use | UNKNOWN · SIN_EVIDENCIA |
| Países incompatibles | UNKNOWN · SIN_EVIDENCIA | UNKNOWN · CONFLICTO |
| Respuesta con dos países | ES · support-es | UNKNOWN · CONFLICTO |
| Uso local de PSE | CO · pse | CO · pse |
| Tercero y contacto local | UNKNOWN · SIN_EVIDENCIA | UNKNOWN · SIN_EVIDENCIA |
| Uso de SPEI negado | UNKNOWN · SIN_EVIDENCIA | UNKNOWN · SIN_EVIDENCIA |
| Yape solicitado | PE · local-rail-request | PE · local-rail-request |

En la prueba de escritura, una fila automática sin evidencia queda con país vacío y motivo `revoked`. Una aprobación manual permanece en su fila. Volver a ejecutar el lote finalizado no duplica escrituras. El código conserva escenario `UNKNOWN`, origen de escaparate y país atribuido como conceptos separados.

En producción, el último recorrido anterior mostraba **6.407 evaluadas, 178 inferidas y 6.229 no atribuibles**. El nuevo recorrido evaluó **6.854**, con **37 inferidas**, **6.817 no atribuibles** y **141 revocaciones automáticas**. Hay 447 elegibles adicionales respecto al estado previo del supervisor. El recuento de nuevas reglas por evidencia fue:

| País | Evidencia | Atribuidas |
| --- | --- | ---: |
| ES | Contacto de soporte localizado | 32 |
| CO | Contacto de soporte localizado | 2 |
| PE | Uso de bancos locales | 1 |
| PE | Solicitud de activación de un medio de pago local | 1 |
| AR | Uso de la aplicación para el país | 1 |

La conciliación posterior encontró 37 aprobaciones automáticas activas, 141 filas automáticas neutralizadas, cero aprobaciones manuales en el histórico operativo y cero filas de geografía ambiguas o inválidas. La preservación de aprobaciones manuales se comprobó con datos de prueba.

## Feedback y accesos

Antes de publicar, la hoja productiva tenía `ALERT_FEEDBACK` con `message_id, vote, recorded_at, observation, status` y una fila histórica sin correo. `NEWSLETTER_INTERACTIONS` no figuraba entre las pestañas. El editor remoto confirmó el contrato de newsletter sin `user_email`. La ausencia de esa pestaña no demuestra por sí sola qué ocurrió con el clic concreto.

La migración se ejecuta con la primera escritura autenticada. Admite feedback de alertas de 3 o 5 columnas y newsletter de 5 o 6 columnas. Añade los campos al final, comprobando el prefijo. La tabla de Administración y su exportación usan el correo registrado. En históricos de newsletter, la recuperación cruza el HMAC con el destinatario y la edición de un envío aceptado. Los identificadores MIME históricos de alertas carecen de una clave de unión en el `ALERT_LOG` actual, por lo que los casos sin identidad recuperable muestran «desconocido». Se verificó esa etiqueta en Administración de la v80.

El acceso se confirma desde la página visible una vez validado el token de la cuenta activa. El RPC arranca antes de bootstrap y permite hasta tres intentos, con esperas de 500 y 1.000 ms. El token permanece disponible hasta la confirmación. Una apertura repetida conserva el identificador y fecha originales. La carga inicial de la página por sí sola no escribe un acceso. Si se cierra la página antes de que llegue el primer RPC, volver a abrir el enlace permite confirmarlo. Las previsualizaciones conservan su espacio de identificadores separado.

## Correos y Análisis mensual

Alertas, vistas previas sin señal o bajo umbral, newsletters ES/EN/TR y avisos de salud materializan fondos y colores de la paleta existente en las tablas y bloques pertinentes. Se conserva el pie con valoración, enlaces e imágenes CID. Las pruebas de HTML y MIME usan entregas simuladas.

| Cliente | Verificación pendiente en dispositivo |
| --- | --- |
| Gmail Android | Comparar claro y oscuro en cabeceras, tarjetas, botones y valoración tras inversión parcial |
| Gmail iOS | Comprobar texto, contraste e imágenes si el cliente transforma la paleta |
| Outlook Android e iOS | Revisar fondos, enlaces y tablas si el cliente reescribe estilos |
| Apple Mail iOS | Comprobar aplicación de `color-scheme`, textos, enlaces y logos en claro y oscuro |

La paridad en clientes con inversión forzada queda pendiente de prueba visual. No hubo envíos reales.

En el navegador integrado, una vista local con HTML y estilos del proyecto confirmó el orden a **1.024 px y 390 px**. Evolución por entidad → Brecha de NPS por bloque → Ejemplos del mes en curso → Pulso mensual → Voz nueva del mes. Las pruebas del dominio y del cliente ejercitan el país activo, inferencia, periodos y exportación. La vista estática comprueba la disposición pero no sustituye la prueba con datos y RPC de Apps Script.

## Producción, verificación y pull request

- `npm test` con Node 24.1.0. La base `develop` pasó 167 pruebas. La iteración pasó 173 sin fallos. Se dejó fuera el cambio previo en `dist.txt`.
- El editor remoto guardaba el esquema de snapshots 11 frente al 12 de la base local e inferencia `storefront-reply-v4` frente a v5. El manifiesto solo difería en el orden de `access` y `executeAs`. Antes de sincronizar, se verificaron los once archivos del candidato y sus diferencias con el editor.
- Se verificó el respaldo **Antes de Iteración 22 · f9db0f2** en el historial de versiones de Sheets. La aplicación web existente pasó de v79 a **v80** el **15 de noviembre de 2026 a las 14:43** de Madrid, desde el commit `f9db0f2`, con acceso corporativo y ejecución como propietario.
- Los dos reprocesos acabaron a las **14:53:54**. Dos ejecuciones del propietario reanudaron los trabajadores existentes tras un primer tramo con 54.000 filas de índice y 5.157 evaluaciones geográficas. Se conciliaron **77.264 filas de fuente e índice y 77.264 claves únicas**, con cero duplicados, cero desalineaciones y cero versiones de clasificación obsoletas o digests vacíos. Las escrituras se limitaron a los derivados y a sus checkpoints.
- A las **14:57:13** se confirmó la reconstrucción de **37 vistas persistentes**. Se retiraron las funciones temporales de ejecución y conciliación, y se verificó que el archivo del trabajador en el editor coincidía con el código publicado.
- Se verificaron `/exec`, los cinco bloques en orden con datos reales, el filtro BEI de Comentarios y el histórico de Feedback. La migración de Feedback y Newsletter se realizará con la primera escritura autenticada. Queda pendiente validar ese ciclo con un enlace firmado en producción y la paridad en clientes móviles de correo.
- Rama `codex/iteracion-22` y [PR #44 a develop](https://github.com/felixdelbarrio/Market-Pulse/pull/44). Los workflows CI y GitFlow pasaron para `f9db0f2`. El PR queda abierto, sin merge.
