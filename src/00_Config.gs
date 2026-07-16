/** Configuracion unica del monitor de Android, iOS y Huawei. */
var MARKETS_CONFIG = Object.freeze({
  codeVersion: '2026.07.16.2',
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
    scorecards: 'DASHBOARD_KPIS',
    trends: 'DASHBOARD_TRENDS',
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
      'MIN_OBSERVATIONS_7D', 'COMPETITOR_ALERTS', 'COUNTRY_PLATFORM_WEIGHT',
      'GROUP_USER_WEIGHT', 'DISPLAY_ORDER'
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
    trends: Object.freeze([
      'PERIOD_MONTH', 'YEAR_MONTH', 'PLATFORM', 'COUNTRY_CODE', 'COUNTRY',
      'APP_KEY', 'APP_NAME', 'IS_BBVA', 'DISPLAY_ORDER', 'RATING_AVG', 'RATING_EOM',
      'RATING_MIN', 'RATING_MAX', 'OBSERVATIONS', 'RANKING_EOM',
      'DELTA_30D_EOM'
    ]),
    alerts: Object.freeze([
      'TIMESTAMP', 'EVENT_KEY', 'REFERENCE_DATE', 'PLATFORM', 'COUNTRY_CODE',
      'TYPE', 'SEVERITY', 'DETAIL', 'RECIPIENTS', 'RUN_ID', 'SOURCE'
    ]),
    runs: Object.freeze([
      'STARTED_AT', 'RUN_ID', 'STATUS', 'APPS_TOTAL', 'APPS_OK', 'APPS_NO_RATING',
      'APPS_ERROR', 'ROWS_UPSERTED', 'ALERTS_CREATED', 'DURATION_MS', 'DETAIL',
      'SCORECARD_ROWS', 'TREND_ROWS'
    ])
  }),
  controlDefaults: Object.freeze([
    ['CODE_VERSION', '2026.07.16.2', 'Version del contrato de datos y del Apps Script'],
    ['TIME_ZONE', 'Europe/Madrid', 'Zona horaria de ejecucion y fechas'],
    ['RUN_HOUR', 7, 'Hora local del trigger diario'],
    ['RUN_MINUTE', 5, 'Minuto aproximado del trigger diario'],
    ['SEND_ALERT_EMAILS', false, 'Enviar emails; mantener FALSE durante la validacion inicial'],
    ['RATING_LOOKBACK_DAYS', 30, 'Ventana para DELTA_30D'],
    ['TARGET_SPREADSHEET_ID', '1IkJgvM2imxm3r1x092q5dqpThrlnDoZ-5QvH8n2h2oQ', 'Google Sheet maestro']
  ])
});

/**
 * Catalogo inicial de Venezuela. Solo se insertan APP_KEY que no existan; las
 * filas que el usuario ya haya configurado nunca se sobrescriben.
 *
 * Los pesos de consolidacion quedan vacios a proposito: deben representar el
 * porcentaje real de usuarios por plataforma y no se deben inferir del rating.
 */
var MARKETS_CATALOG_SEEDS = Object.freeze([
  ['ANDROID|VE|BBVA', 'Android', 'Google Play', 'VE', 'Venezuela', 'BBVA', 'com.bbva.empresas', 'com.bbva.empresas', true, true, 'es', '', 0.30, 0.50, 5, true, '', '', 0],
  ['ANDROID|VE|MERCANTIL_EMPRESAS', 'Android', 'Google Play', 'VE', 'Venezuela', 'Mercantil Empresas', 'com.mercantilbanco.mme.mercantilmovil', 'com.mercantilbanco.mme.mercantilmovil', false, true, 'es', '', 0.30, 0.50, 5, true, '', '', 1],
  ['ANDROID|VE|BANESCO_VE', 'Android', 'Google Play', 'VE', 'Venezuela', 'Banesco VE', 'com.banesco.samfbancamovilunificada', 'com.banesco.samfbancamovilunificada', false, true, 'es', '', 0.30, 0.50, 5, true, '', '', 2],
  ['ANDROID|VE|BANCARIBE_EMPRESAS', 'Android', 'Google Play', 'VE', 'Venezuela', 'Bancaribe Empresas', 'bancaribeMobileBankingCash.v1', 'bancaribeMobileBankingCash.v1', false, true, 'es', '', 0.30, 0.50, 5, true, '', '', 3],
  ['ANDROID|VE|BNC', 'Android', 'Google Play', 'VE', 'Venezuela', 'BNC', 'bnc.bncnet.mobile2', 'bnc.bncnet.mobile2', false, true, 'es', '', 0.30, 0.50, 5, true, '', '', 4],

  ['IOS|VE|BBVA', 'iOS', 'App Store', 'VE', 'Venezuela', 'BBVA', '1590189082', '', true, true, 'es', '', 0.30, 0.50, 5, true, '', '', 0],
  ['IOS|VE|MERCANTIL_EMPRESAS', 'iOS', 'App Store', 'VE', 'Venezuela', 'Mercantil Empresas', '1548017515', '', false, true, 'es', '', 0.30, 0.50, 5, true, '', '', 1],
  ['IOS|VE|BANESCO_VE', 'iOS', 'App Store', 'VE', 'Venezuela', 'Banesco VE', '1497546462', '', false, true, 'es', '', 0.30, 0.50, 5, true, '', '', 2],
  ['IOS|VE|BANCARIBE_EMPRESAS', 'iOS', 'App Store', 'VE', 'Venezuela', 'Bancaribe Empresas', '1542090352', '', false, true, 'es', '', 0.30, 0.50, 5, true, '', '', 3],
  ['IOS|VE|BNC', 'iOS', 'App Store', 'VE', 'Venezuela', 'BNC', '1635259975', '', false, true, 'es', '', 0.30, 0.50, 5, true, '', '', 4],

  ['HUAWEI|VE|BBVA', 'Huawei', 'Huawei AppGallery', 'VE', 'Venezuela', 'BBVA', 'C1751602113005231488', 'com.bbva.empresas', true, true, 'es_VE', '', 0.30, 0.50, 5, true, '', '', 0],
  ['HUAWEI|VE|MERCANTIL_EMPRESAS', 'Huawei', 'Huawei AppGallery', 'VE', 'Venezuela', 'Mercantil Empresas', 'C1746451170823523136', 'com.mercantilbanco.mme.mercantilmovil', false, true, 'es_VE', '', 0.30, 0.50, 5, true, '', '', 1],
  ['HUAWEI|VE|BANESCO_VE', 'Huawei', 'Huawei AppGallery', 'VE', 'Venezuela', 'Banesco VE', 'C1801620142921151424', 'com.banesco.samfbancamovilunificada', false, true, 'es_VE', '', 0.30, 0.50, 5, true, '', '', 2],
  ['HUAWEI|VE|BANCARIBE_EMPRESAS', 'Huawei', 'Huawei AppGallery', 'VE', 'Venezuela', 'Bancaribe Empresas', 'C1765377894340655808', 'bancaribeMobileBankingCash.v1', false, true, 'es_VE', '', 0.30, 0.50, 5, true, '', '', 3],
  ['HUAWEI|VE|BNC', 'Huawei', 'Huawei AppGallery', 'VE', 'Venezuela', 'BNC', 'C1742708304376777536', 'bnc.bncnet.mobile2', false, true, 'es_VE', '', 0.30, 0.50, 5, true, '', '', 4]
]);
