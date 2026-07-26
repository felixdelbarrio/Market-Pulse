# Google Workspace: remitente y vigilancia de Market Pulse

## Diagnostico de la Iteracion 2

El `RUN_LOG` del libro entregado demuestra que la ejecucion del 22/07/2026 fallo al llamar a `gmail.users.settings.sendAs.list`: el manifiesto ya declaraba `gmail.settings.basic`, pero la cuenta propietaria del trigger no habia concedido ese scope a la version en ejecucion. Los triggers instalables no pueden abrir el dialogo de consentimiento mientras se ejecutan en segundo plano.

Las dos alertas generadas por ese run se habian escrito en `ALERT_LOG` antes de que Gmail aceptase el correo. El siguiente run las considero duplicadas. La nueva version invierte esa transaccion: solo audita los destinatarios aceptados y excluye del indice de deduplicacion los eventos pertenecientes a runs de entrega fallidos.

## Modelo correcto: grupo, alias y buzon

`voc-commercial.group@bbva.com` es un Google Group. Puede ser direccion de distribucion, identidad visible y archivo de conversaciones si se publica al propio grupo, pero no es una cuenta de Gmail con carpetas Recibidos/Enviados.

Las alertas personalizadas se envian con Gmail API como el usuario que creo el trigger y con el Group verificado como `From`. El destinatario ve `BBVA Market Pulse <voc-commercial.group@bbva.com>`, pero el mensaje pertenece tecnicamente al buzon del usuario autenticado. No se envia copia al grupo porque hacerlo archivaria y distribuiria contenido privado de cada suscriptor.

Si el requisito literal es que los mensajes aparezcan en una carpeta **Enviados** propia de `voc-commercial.group@bbva.com`, hace falta una cuenta de Gmail/Workspace dedicada y delegada, no un Google Group. El codigo actual implementa el modelo compatible con Group: identidad `From` verificada y alertas individuales privadas.

El aviso tecnico del watchdog si se dirige a `MONITOR_ADMIN_EMAIL`, cuyo valor recomendado es el Group. De ese modo queda en el historial de conversaciones y llega a sus administradores sin copiar alertas personalizadas.

## Configuracion recomendada del grupo

1. Mantener a la cuenta que crea los triggers como miembro y propietario/administrador del grupo.
2. Cambiar **Quien puede publicar** de `Cualquier usuario de la Web` a `Miembros del grupo`. La configuracion actual es innecesariamente abierta.
3. Mantener **Quien puede publicar como grupo** limitado a propietarios o administradores.
4. Mantener **Remitente predeterminado: Correo del grupo**.
5. Mantener activa la publicacion por correo electronico y el historial de conversaciones.
6. Para el canal tecnico, usar `Sin moderacion` para miembros de confianza. Ajustar el tratamiento de spam a la politica corporativa, procurando que los avisos del propietario no queden en moderacion.
7. La bandeja colaborativa es opcional. Activarla solo si se quiere asignar, etiquetar y cerrar incidencias del watchdog; no cambia la identidad real con la que Gmail API envia alertas privadas.
8. En Gmail de la cuenta propietaria, conservar el Group en **Cuentas > Enviar como**, completar la verificacion y confirmar que no aparece como pendiente.

## Activacion segura despues del despliegue

1. Publicar los archivos de `src/`, incluido `57_MonitorHealth.gs` y el manifiesto. En **Implementar > Administrar implementaciones**, editar la implementacion web existente, seleccionar **Nueva version** y guardar; actualizar el codigo no cambia por si solo la version atendida por la URL `/exec`.
2. Ejecutar `setupProject()` desde el editor de Apps Script.
3. Ejecutar `authorizeAndInstallMarketsAutomation()` desde el editor y aceptar todos los permisos solicitados, incluidos `userinfo.email`, `gmail.send` y `gmail.settings.basic`. El resultado esperado contiene `verificationStatus: accepted`, proceso `07:05 Europe/Madrid`, newsletter mensual el día 1 a las `08:15` y vigilancia `09:15 Europe/Madrid`.
4. Ejecutar `validateMarketsAlertSender()` y comprobar `available: true`.
5. Ejecutar `sendMarketsAlertTestEmail()` y `sendMarketsNewsletterTestEmail()` desde la aplicacion y verificar destinatario, `From`, Gmail Message ID, fecha de datos y que el contenido procede de la configuración vigente.
6. Ejecutar `sendMarketsMonitorHealthTestEmail()` y comprobar que el aviso aparece en el Group/destino tecnico.
7. Revisar en Apps Script > Triggers que existen exactamente `runDailyRatingMonitor`, `runMarketsMonthlyNewsletter` y `checkDailyRatingMonitorHealth` bajo la cuenta autorizada.
8. Al dia siguiente, comprobar en `RUN_LOG` `ALERT_SUBSCRIBERS`, `EMAILS_SENT`, `ALERT_DELIVERY_STATUS` y `ALERT_DELIVERY_DETAIL`.

## Criterio de salud

Un run `PARTIAL` sigue siendo saludable cuando al menos una aplicacion se ha obtenido y materializado; las fichas sin rating publico no deben convertir la operacion completa en fallo. El watchdog avisa una sola vez al dia cuando:

- no existe run para la fecha esperada;
- el run termino en error o no produjo datos utilizables;
- el canal de alertas termino en `ERROR` o `PARTIAL`.

El aviso pide ejecutar `runNow()` manualmente y revisar `RUN_LOG`. Su deduplicacion se conserva en `PropertiesService` y no añade ruido al libro.

## Referencias oficiales

- Autorizacion y triggers: https://developers.google.com/apps-script/guides/services/authorization
- Scopes en Apps Script: https://developers.google.com/apps-script/concepts/scopes
- Triggers instalables: https://developers.google.com/apps-script/guides/triggers/installable
- Ajustes de Google Groups: https://support.google.com/groups/answer/2464926
- Bandeja colaborativa: https://support.google.com/a/users/answer/10375787
- Alias `sendAs` de Gmail: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs
