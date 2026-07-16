/** Configuracion unica del monitor de Android, iOS y Huawei. */
var MARKETS_CONFIG = Object.freeze({
  codeVersion: '2026.07.16.1',
  spreadsheetId: '1IkJgvM2imxm3r1x092q5dqpThrlnDoZ-5QvH8n2h2oQ',
  timeZone: 'Europe/Madrid',
  runHour: 7,
  runMinute: 5,
  lockTimeoutMs: 30000,
  requestRetries: 2,
  retryBaseDelayMs: 1200,
  huaweiBatchSize: 6,
  huaweiBatchDelayMs: 300,
  sheets: Object.freeze({
    control: 'CONTROL',
    catalog: 'APP_CATALOG',
    ratings: 'RATINGS',
    reviews: 'REVIEWS',
    alerts: 'ALERT_LOG',
    runs: 'RUN_LOG'
  }),
  headers: Object.freeze({
    control: Object.freeze(['PARAMETER', 'VALUE', 'DESCRIPTION']),
    catalog: Object.freeze([
      'APP_KEY', 'PLATFORM', 'STORE', 'COUNTRY_CODE', 'COUNTRY', 'APP_NAME',
      'APP_ID', 'PACKAGE_NAME', 'IS_BBVA', 'ENABLED', 'LOCALE',
      'ALERT_RECIPIENTS', 'WARNING_DROP', 'CRITICAL_DROP',
      'MIN_OBSERVATIONS_7D', 'COMPETITOR_ALERTS'
    ]),
    ratings: Object.freeze([
      'RECORD_KEY', 'OBSERVED_DATE', 'YEAR', 'YEAR_MONTH', 'PLATFORM', 'STORE',
      'COUNTRY_CODE', 'COUNTRY', 'APP_KEY', 'APP_NAME', 'APP_ID', 'IS_BBVA',
      'RATING', 'RATING_COUNT', 'RANKING', 'PREVIOUS_RATING_30D', 'DELTA_30D',
      'IS_LATEST', 'SOURCE', 'INGESTED_AT'
    ]),
    reviews: Object.freeze([
      'REVIEW_KEY', 'REVIEW_ID', 'REVIEW_DATE', 'YEAR_MONTH', 'PLATFORM', 'STORE',
      'COUNTRY_CODE', 'COUNTRY', 'APP_KEY', 'APP_NAME', 'APP_VERSION',
      'STAR_RATING', 'TITLE', 'REVIEW_TEXT', 'USER_NAME', 'THUMBS_UP_COUNT',
      'REPLY_TEXT', 'REPLY_DATE', 'TOPICS', 'SOURCE'
    ]),
    alerts: Object.freeze([
      'TIMESTAMP', 'EVENT_KEY', 'REFERENCE_DATE', 'PLATFORM', 'COUNTRY_CODE',
      'TYPE', 'SEVERITY', 'DETAIL', 'RECIPIENTS', 'RUN_ID', 'SOURCE'
    ]),
    runs: Object.freeze([
      'STARTED_AT', 'RUN_ID', 'STATUS', 'APPS_TOTAL', 'APPS_OK', 'APPS_NO_RATING',
      'APPS_ERROR', 'ROWS_UPSERTED', 'ALERTS_CREATED', 'DURATION_MS', 'DETAIL'
    ])
  }),
  controlDefaults: Object.freeze([
    ['CODE_VERSION', '2026.07.16.1', 'Version del contrato de datos y del Apps Script'],
    ['TIME_ZONE', 'Europe/Madrid', 'Zona horaria de ejecucion y fechas'],
    ['RUN_HOUR', 7, 'Hora local del trigger diario'],
    ['RUN_MINUTE', 5, 'Minuto aproximado del trigger diario'],
    ['SEND_ALERT_EMAILS', false, 'Enviar emails; mantener FALSE durante la validacion inicial'],
    ['RATING_LOOKBACK_DAYS', 30, 'Ventana para DELTA_30D'],
    ['TARGET_SPREADSHEET_ID', '1IkJgvM2imxm3r1x092q5dqpThrlnDoZ-5QvH8n2h2oQ', 'Google Sheet maestro']
  ])
});

