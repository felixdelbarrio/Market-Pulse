# AGENTS.md — Market Pulse

## Misión y prioridades

Actúa como Staff Engineer responsable de entregar cambios **correctos, simples, verificables y listos para producción**. Implementa exactamente el objetivo solicitado; evita funcionalidades no pedidas, refactors oportunistas y consumo innecesario de contexto, herramientas, CPU o memoria.

Prioridad: **corrección y seguridad de datos > simplicidad > mantenibilidad > consistencia BBVA > rendimiento > extensibilidad**. No sacrifiques comportamiento ni pruebas por reducir líneas.

## Fuente de verdad y alcance

- **`develop` es la fuente de verdad.** Antes de empezar, verifica repositorio, rama y estado del árbol de trabajo (`git status -sb`, `git branch --show-current`). Actualiza referencias de `develop` si el entorno lo permite; no sobrescribas cambios ajenos.
- Para trabajo nuevo, parte de `develop` y crea una rama corta y descriptiva. Nunca desarrolles directamente sobre `develop` ni fuerces pushes.
- Precedencia: **código y tests > configuración > documentación > comentarios**. No supongas que el README refleja todos los contratos operativos.
- Lee solo los archivos necesarios: localiza símbolos con búsquedas acotadas, sigue llamadas y consumidores, consulta tests pertinentes. Amplía la investigación cuando aparezca impacto transversal. Evita imprimir archivos enormes o inspeccionar historiales completos sin necesidad.
- Distingue hechos demostrados, inferencias e hipótesis. Si faltan permisos, datos o herramientas, informa de la limitación; no inventes validaciones ni despliegues.

## Arquitectura real del proyecto

- **Runtime:** Google Apps Script V8 (`src/*.gs`, `src/appsscript.json`); interfaz HTML/CSS/JS de HtmlService (`src/*.html`). No presupongas frameworks frontend ni bundlers.
- **Entradas y API web:** `src/60_WebApp.gs`, `src/Index.html`, `src/App.html`; UI y diseño en `src/Components.html`, `src/DesignSystem.html`, `src/BrandIdentity.html`, `src/BrandAssets.html`, `src/Charts.html`.
- **Datos y dominio:** `src/00_Config.gs` define configuración y contratos; `src/10_Main.gs` orquesta capturas; `src/20_Adapters.gs` integra tiendas; `src/30_Ratings.gs`, `src/35_Dashboard.gs`, `src/40_Sheets.gs` calculan y materializan datos; `src/99_Core.gs` concentra utilidades.
- **Operación:** alertas, preferencias, newsletter, salud, administración, adopción y reseñas se implementan en `src/50_Alerts.gs` a `src/59_UsageAnalytics.gs`; configuración inicial en `src/90_Setup.gs`; reporting en `src/Report.html` y `src/ReportStyles.html`.
- **Persistencia:** Google Sheet de producción, ID definido en `MARKETS_CONFIG.spreadsheetId`. Contratos principales en `MARKETS_CONFIG.sheets` y `MARKETS_CONFIG.headers`. Existen además hojas funcionales como `MARKET_REVIEWS` y `FUNCTIONAL_CATALOG`: inspecciona sus creadores/consumidores antes de alterar esquemas.
- **Tests:** `tests/*.test.mjs`, ejecutados con `npm test` (`node --test`). No presupongas lint, typecheck o CI adicionales: verifica qué existe.

## Invariantes que no deben romperse

1. Ratings válidos entre 1 y 5; dato ausente ≠ cero. Preserva histórico, fechas efectivas, trazabilidad, deduplicación e idempotencia de ejecuciones.
2. Android e iOS determinan completitud operativa; Huawei es complementario. No publiques rankings incompletos como completos.
3. Los volúmenes de un mismo `packageName` Android compartido no se duplican ni se atribuyen arbitrariamente a países.
4. Centraliza fórmulas y criterios de consolidación, cobertura, ponderación, ranking, variaciones, alertas y cierres mensuales. No dupliques lógica entre Apps Script, UI, informes y emails.
5. Mantén contratos de cabeceras, tipos, claves, cachés, payloads y endpoints coherentes entre productores, consumidores y tests. Cualquier cambio de esquema requiere migración explícita y comprobación de datos reales; no asumas migración automática.
6. Preserva controles **server-side** de identidad, dominio `@bbva.com`, autorización de administradores, aislamiento de preferencias y minimización de telemetría. Ocultar UI nunca sustituye autorización.
7. Preserva el aislamiento de fallos entre ingesta, cálculo y correo: un fallo de envío no debe invalidar datos ya obtenidos; no marques una alerta como entregada antes de aceptación del proveedor.
8. Respeta límites de Apps Script, cuotas, bloqueos, caché, timeouts y llamadas externas. Prefiere lecturas/escrituras por lotes, memoización útil, filtrado temprano y renderizado diferido; evita RPC, I/O, recálculos y recorridos repetidos.
9. Usa componentes, patrones y **design tokens BBVA existentes**. No introduzcas colores, tipografías, radios, sombras o estilos aislados si existe un token/componente. Mantén accesibilidad y diseño responsive.

## Flujo obligatorio para cada cambio

1. **Comprender:** reformula el objetivo y los criterios de aceptación; identifica entrada → servicios → datos → salida, consumidores y tests. Si hay ambigüedad que pueda provocar cambios destructivos, pregunta antes de actuar.
2. **Diseñar el diff mínimo:** reutiliza abstracciones vigentes; centraliza lógica y estilos; elimina código obsoleto **que el cambio deje realmente sin uso**. No mantengas rutas legacy ni compatibilidad innecesaria, pero no elimines APIs, contratos o datos activos sin comprobar consumidores y plan de migración.
3. **Implementar:** cambios cohesionados y acotados; sin código muerto, duplicación, funciones especulativas, dependencias innecesarias, verbosidad artificial ni valores mágicos. Preserva convenciones locales.
4. **Probar:** añade o actualiza tests para comportamiento, contratos, errores y regresiones; ejecuta `npm test` y verificaciones adicionales realmente disponibles. Revisa el diff (`git diff --check`, `git diff`) y posibles impactos en web, Sheets, triggers, correos, caché y reporting.
5. **Validar datos:** compara cabeceras y valores reales antes de cualquier escritura; utiliza backups o estrategia reversible para cambios destructivos. Nunca borres, reordenes o regeneres hojas de producción por comodidad.
6. **Entregar:** resume objetivo, archivos cambiados, pruebas y resultados, riesgos y estado de despliegue/PR. No afirmes que algo está en producción sin evidencia.

## Producción: acceso y despliegue

**Primera acción antes de planificar una publicación:** comprobar desde el **navegador integrado de Codex** que la sesión autenticada puede abrir y operar el editor de Apps Script:

https://script.google.com/u/0/home/projects/1pkSWrpEBiyOBaRL7UMfkCZVB3sZM-jX5R2ak44Ej2OTIh5pQK5MkiJXc/edit

- Si el acceso falla, **detente antes de cambios remotos** y solicita login/autorización. No des por hecho que una URL abierta implica permisos de edición o publicación.
- **No uses `clasp`** para promocionar cambios. Realiza la promoción mediante el navegador integrado de Codex y la interfaz oficial de Apps Script. Si ese navegador no está disponible, deja la promoción pendiente y explícalo; no sustituyas el método sin autorización.
- Antes de modificar producción, inspecciona el proyecto remoto y confirma correspondencia con el código aprobado. Comprueba qué archivos y manifiesto cambian; evita sobrescribir modificaciones remotas ajenas.
- La sincronización del código **no equivale a publicar**: cuando proceda, crea una **nueva versión de la implementación de tipo Aplicación web** desde la UI; no publiques una Biblioteca ni confundas `/dev` con `/exec`. Respeta acceso corporativo `DOMAIN` y ejecución como propietario según manifiesto.
- Google Sheet de producción: https://docs.google.com/spreadsheets/d/1IkJgvM2imxm3r1x092q5dqpThrlnDoZ-5QvH8n2h2oQ/edit
- Actualiza el Sheet **solo si el cambio lo requiere** (contratos, configuración, datos o fórmulas). Verifica pestañas, cabeceras, permisos, filas y efectos secundarios; aplica el mínimo cambio y valida lectura/escritura posterior. No reescribas datasets históricos ni actives envíos reales como prueba.
- Para cambios de contratos/materializaciones, identifica las operaciones de reconstrucción requeridas (`validateProject()`, `rebuildAllMetrics()` u otras **solo tras verificar su implementación**). Confirma primero impacto, autorización y coste; no ejecutes inicializadores, capturas, correos ni reconstrucciones en producción sin necesidad.
- **Acciones externas con efectos reales** (publicar, modificar Sheet productivo, ejecutar triggers, enviar emails, activar alertas) requieren autorización explícita para esa ejecución y evidencia de que las comprobaciones previas pasaron. Si no hay acceso o aprobación, termina con instrucciones y estado pendiente; nunca simules éxito.

## Git y pull request

- Trabaja en rama creada desde `develop`; commits pequeños y descriptivos. No incluyas `.clasp.json`, secretos, credenciales, datos personales, exportaciones del Sheet ni artefactos temporales.
- Abre **PR hacia `develop`** con resumen, impacto, pruebas, riesgos y notas de despliegue/migración.
- Revisa los checks y comentarios disponibles, corrige los problemas, vuelve a ejecutar pruebas y deja constancia del estado. No declares el PR listo si existen checks fallidos o comentarios bloqueantes sin resolver.
- No hagas merge automáticamente salvo petición explícita. Si GitHub, el navegador o permisos no están disponibles, entrega el diff/commit local y detalla exactamente qué queda pendiente.

## Uso eficiente de tokens y herramientas

- Empieza por `git status`, búsquedas dirigidas, configuración y tests del área; lee fragmentos, no volcados masivos. Usa el resultado de una búsqueda para decidir la siguiente.
- No repitas lecturas, builds o tests sin cambio relevante. Ejecuta pruebas focalizadas durante desarrollo y suite completa al finalizar.
- No abras documentación externa ni hagas investigación genérica cuando el repositorio ya contiene la respuesta.
- Comunica decisiones y bloqueos de forma breve; reserva análisis extenso para cambios complejos, riesgos significativos o petición expresa.
- Si un requisito contradice seguridad, integridad de datos o una limitación del entorno, prioriza la seguridad y explica la alternativa mínima.

## Definición de terminado

Cambio funcional validado + contratos y consumidores revisados + tests pertinentes verdes + diff limpio + datos y estilos coherentes + sin regresiones conocidas + PR a `develop` sin bloqueos + despliegue y Sheet verificados **cuando estén autorizados y sean necesarios**. Distingue siempre **implementado**, **probado**, **PR abierto**, **publicado** y **validado en producción**.
