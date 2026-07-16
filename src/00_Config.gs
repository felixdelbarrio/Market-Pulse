/** Configuracion unica del monitor de Android, iOS y Huawei. */
var MARKETS_CONFIG = Object.freeze({
  codeVersion: '2026.07.16.3',
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
    competition: 'DASHBOARD_COMPETITION',
    trends: 'DASHBOARD_TRENDS',
    fetchLog: 'FETCH_LOG',
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
      'GROUP_USER_WEIGHT', 'DISPLAY_ORDER', 'MARKET_SEGMENT',
      'DASHBOARD_SECTION', 'COMPETITOR_SET_VERSION', 'PRODUCT_SCOPE',
      'WEIGHT_SOURCE', 'WEIGHT_EFFECTIVE_DATE'
    ]),
    ratings: Object.freeze([
      'RECORD_KEY', 'OBSERVED_DATE', 'YEAR', 'YEAR_MONTH', 'PLATFORM', 'STORE',
      'COUNTRY_CODE', 'COUNTRY', 'APP_KEY', 'APP_NAME', 'APP_ID', 'IS_BBVA',
      'RATING', 'RATING_COUNT', 'RANKING', 'PREVIOUS_RATING_30D', 'DELTA_30D',
      'IS_LATEST', 'SOURCE', 'INGESTED_AT', 'MARKET_SEGMENT', 'DISPLAY_ORDER',
      'RANKING_EXPECTED_APPS', 'RANKING_OBSERVED_APPS', 'RANKING_COVERAGE',
      'RANKING_IS_COMPLETE'
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
      'DELTA_30D_EOM', 'MARKET_SEGMENT', 'DASHBOARD_SECTION', 'PRODUCT_SCOPE',
      'RANKING_EXPECTED_APPS', 'RANKING_OBSERVED_APPS', 'RANKING_COVERAGE',
      'RANKING_IS_COMPLETE_EOM'
    ]),
    competition: Object.freeze([
      'OBSERVED_DATE', 'YEAR_MONTH', 'PLATFORM', 'COUNTRY_CODE', 'COUNTRY',
      'MARKET_SEGMENT', 'DASHBOARD_SECTION', 'PRODUCT_SCOPE',
      'COMPETITOR_SET_VERSION', 'APP_KEY', 'APP_NAME', 'IS_BBVA', 'DISPLAY_ORDER',
      'RATING', 'RATING_COUNT', 'RANKING', 'RANKING_EXPECTED_APPS',
      'RANKING_OBSERVED_APPS', 'RANKING_COVERAGE', 'RANKING_IS_COMPLETE',
      'PREVIOUS_RATING_30D', 'DELTA_30D', 'IS_LATEST', 'INGESTED_AT',
      'IS_FRESH_THIS_RUN', 'FETCH_STATUS', 'RUN_ID'
    ]),
    fetchLog: Object.freeze([
      'RUN_ID', 'REFERENCE_DATE', 'FETCHED_AT', 'APP_KEY', 'PLATFORM',
      'COUNTRY_CODE', 'MARKET_SEGMENT', 'STATUS', 'HTTP_STATUS', 'RATING',
      'RATING_COUNT', 'RETRYABLE', 'DETAIL', 'SOURCE'
    ]),
    alerts: Object.freeze([
      'TIMESTAMP', 'EVENT_KEY', 'REFERENCE_DATE', 'PLATFORM', 'COUNTRY_CODE',
      'TYPE', 'SEVERITY', 'DETAIL', 'RECIPIENTS', 'RUN_ID', 'SOURCE'
    ]),
    runs: Object.freeze([
      'STARTED_AT', 'RUN_ID', 'STATUS', 'APPS_TOTAL', 'APPS_OK', 'APPS_NO_RATING',
      'APPS_ERROR', 'ROWS_UPSERTED', 'ALERTS_CREATED', 'DURATION_MS', 'DETAIL',
      'SCORECARD_ROWS', 'TREND_ROWS', 'COMPETITION_ROWS', 'FRESH_APPS',
      'WEIGHT_CONFIG_STATUS'
    ])
  }),
  controlDefaults: Object.freeze([
    ['CODE_VERSION', '2026.07.16.3', 'Version del contrato de datos y del Apps Script'],
    ['TIME_ZONE', 'Europe/Madrid', 'Zona horaria de ejecucion y fechas'],
    ['RUN_HOUR', 7, 'Hora local del trigger diario'],
    ['RUN_MINUTE', 5, 'Minuto aproximado del trigger diario'],
    ['SEND_ALERT_EMAILS', false, 'Enviar emails; mantener FALSE durante la validacion inicial'],
    ['RATING_LOOKBACK_DAYS', 30, 'Ventana para DELTA_30D'],
    ['TARGET_SPREADSHEET_ID', '1IkJgvM2imxm3r1x092q5dqpThrlnDoZ-5QvH8n2h2oQ', 'Google Sheet maestro'],
    ['REQUIRE_COMPLETE_RANKING', true, 'Publicar ranking solo cuando todo el benchmark esperado tenga rating'],
    ['REQUIRE_WEIGHT_SOURCE', true, 'Exigir fuente y fecha efectiva antes de publicar consolidados ponderados']
  ])
});

/**
 * Catalogo inicial de Venezuela. Solo se insertan APP_KEY que no existan; las
 * filas que el usuario ya haya configurado nunca se sobrescriben.
 *
 * Los pesos de consolidacion quedan vacios a proposito: deben representar el
 * porcentaje real de usuarios por plataforma y no se deben inferir del rating.
 */
function catalogSeed_(key, platform, countryCode, country, appName, appId, packageName, isBbva, order, segment, section, scope) {
  return [key, platform, platform === 'Android' ? 'Google Play' : platform === 'iOS' ? 'App Store' : 'Huawei AppGallery',
    countryCode, country, appName, appId || '', packageName || '', Boolean(isBbva), true,
    platform === 'Huawei' ? (countryCode === 'DE' ? 'de_DE' : countryCode === 'IT' ? 'it_IT' : 'es_' + countryCode) :
      (countryCode === 'DE' ? 'de' : countryCode === 'IT' ? 'it' : 'es'),
    '', 0.30, 0.50, 5, true, '', '', order, segment || 'BANK', section || 'COUNTRY_BANKS',
    '2026Q3', scope || 'BUSINESS', '', ''];
}

var MARKETS_CATALOG_SEEDS = Object.freeze([
  catalogSeed_('ANDROID|VE|BBVA', 'Android', 'VE', 'Venezuela', 'BBVA', 'com.bbva.empresas', 'com.bbva.empresas', true, 0),
  catalogSeed_('ANDROID|VE|MERCANTIL_EMPRESAS', 'Android', 'VE', 'Venezuela', 'Mercantil Empresas', 'com.mercantilbanco.mme.mercantilmovil', 'com.mercantilbanco.mme.mercantilmovil', false, 1),
  catalogSeed_('ANDROID|VE|BANESCO_VE', 'Android', 'VE', 'Venezuela', 'Banesco VE', 'com.banesco.samfbancamovilunificada', 'com.banesco.samfbancamovilunificada', false, 2),
  catalogSeed_('ANDROID|VE|BANCARIBE_EMPRESAS', 'Android', 'VE', 'Venezuela', 'Bancaribe Empresas', 'bancaribeMobileBankingCash.v1', 'bancaribeMobileBankingCash.v1', false, 3),
  catalogSeed_('ANDROID|VE|BNC', 'Android', 'VE', 'Venezuela', 'BNC', 'bnc.bncnet.mobile2', 'bnc.bncnet.mobile2', false, 4),

  catalogSeed_('IOS|VE|BBVA', 'iOS', 'VE', 'Venezuela', 'BBVA', '1590189082', '', true, 0),
  catalogSeed_('IOS|VE|MERCANTIL_EMPRESAS', 'iOS', 'VE', 'Venezuela', 'Mercantil Empresas', '1548017515', '', false, 1),
  catalogSeed_('IOS|VE|BANESCO_VE', 'iOS', 'VE', 'Venezuela', 'Banesco VE', '1497546462', '', false, 2),
  catalogSeed_('IOS|VE|BANCARIBE_EMPRESAS', 'iOS', 'VE', 'Venezuela', 'Bancaribe Empresas', '1542090352', '', false, 3),
  catalogSeed_('IOS|VE|BNC', 'iOS', 'VE', 'Venezuela', 'BNC', '1635259975', '', false, 4),

  catalogSeed_('HUAWEI|VE|BBVA', 'Huawei', 'VE', 'Venezuela', 'BBVA', 'C1751602113005231488', 'com.bbva.empresas', true, 0),
  catalogSeed_('HUAWEI|VE|MERCANTIL_EMPRESAS', 'Huawei', 'VE', 'Venezuela', 'Mercantil Empresas', 'C1746451170823523136', 'com.mercantilbanco.mme.mercantilmovil', false, 1),
  catalogSeed_('HUAWEI|VE|BANESCO_VE', 'Huawei', 'VE', 'Venezuela', 'Banesco VE', 'C1801620142921151424', 'com.banesco.samfbancamovilunificada', false, 2),
  catalogSeed_('HUAWEI|VE|BANCARIBE_EMPRESAS', 'Huawei', 'VE', 'Venezuela', 'Bancaribe Empresas', 'C1765377894340655808', 'bancaribeMobileBankingCash.v1', false, 3),
  catalogSeed_('HUAWEI|VE|BNC', 'Huawei', 'VE', 'Venezuela', 'BNC', 'C1742708304376777536', 'bnc.bncnet.mobile2', false, 4),

  catalogSeed_('ANDROID|IT|BBVA', 'Android', 'IT', 'Italy', 'BBVA', 'com.bbva.italy', 'com.bbva.italy', true, 0, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('ANDROID|IT|INTESA', 'Android', 'IT', 'Italy', 'Intesa Sanpaolo Mobile', 'com.latuabancaperandroid', 'com.latuabancaperandroid', false, 1, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('ANDROID|IT|UNICREDIT', 'Android', 'IT', 'Italy', 'UniCredit', 'com.unicredit', 'com.unicredit', false, 2, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('ANDROID|IT|BPER', 'Android', 'IT', 'Italy', 'BPER', 'it.gruppobper.ams.android.bper', 'it.gruppobper.ams.android.bper', false, 3, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('ANDROID|IT|POSTE', 'Android', 'IT', 'Italy', 'Poste Italiane', 'com.posteitaliane.spim', 'com.posteitaliane.spim', false, 4, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('IOS|IT|BBVA', 'iOS', 'IT', 'Italy', 'BBVA', '1536949050', '', true, 0, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('IOS|IT|INTESA', 'iOS', 'IT', 'Italy', 'Intesa Sanpaolo Mobile', '597360475', '', false, 1, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('IOS|IT|UNICREDIT', 'iOS', 'IT', 'Italy', 'UniCredit', '396670008', '', false, 2, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('IOS|IT|BPER', 'iOS', 'IT', 'Italy', 'BPER', '554965344', '', false, 3, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('IOS|IT|POSTE', 'iOS', 'IT', 'Italy', 'Poste Italiane', '781421802', '', false, 4, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('HUAWEI|IT|BBVA', 'Huawei', 'IT', 'Italy', 'BBVA', '', 'com.bbva.italy', true, 0, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('HUAWEI|IT|INTESA', 'Huawei', 'IT', 'Italy', 'Intesa Sanpaolo Mobile', '', 'com.latuabancaperandroid', false, 1, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('HUAWEI|IT|UNICREDIT', 'Huawei', 'IT', 'Italy', 'UniCredit', '', 'com.unicredit', false, 2, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('HUAWEI|IT|BPER', 'Huawei', 'IT', 'Italy', 'BPER', '', 'it.gruppobper.ams.android.bper', false, 3, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('HUAWEI|IT|POSTE', 'Huawei', 'IT', 'Italy', 'Poste Italiane', '', 'com.posteitaliane.spim', false, 4, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),

  catalogSeed_('ANDROID|DE|BBVA', 'Android', 'DE', 'Germany', 'BBVA', 'com.bbva.germany', 'com.bbva.germany', true, 0, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('ANDROID|DE|DEUTSCHE_BANK', 'Android', 'DE', 'Germany', 'Deutsche Bank', 'com.db.pwcc.dbmobile', 'com.db.pwcc.dbmobile', false, 1, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('ANDROID|DE|COMMERZBANK', 'Android', 'DE', 'Germany', 'Commerzbank', 'de.commerzbanking.mobil', 'de.commerzbanking.mobil', false, 2, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('ANDROID|DE|SPARKASSE', 'Android', 'DE', 'Germany', 'Sparkasse', 'com.starfinanz.smob.android.sfinanzstatus', 'com.starfinanz.smob.android.sfinanzstatus', false, 3, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('ANDROID|DE|ING', 'Android', 'DE', 'Germany', 'ING Germany', 'de.ingdiba.bankingapp', 'de.ingdiba.bankingapp', false, 4, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('IOS|DE|BBVA', 'iOS', 'DE', 'Germany', 'BBVA', '6670434593', '', true, 0, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('IOS|DE|DEUTSCHE_BANK', 'iOS', 'DE', 'Germany', 'Deutsche Bank', '1040475847', '', false, 1, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('IOS|DE|COMMERZBANK', 'iOS', 'DE', 'Germany', 'Commerzbank', '366609901', '', false, 2, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('IOS|DE|SPARKASSE', 'iOS', 'DE', 'Germany', 'Sparkasse', '320599923', '', false, 3, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('IOS|DE|ING', 'iOS', 'DE', 'Germany', 'ING Germany', '1176527145', '', false, 4, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('HUAWEI|DE|BBVA', 'Huawei', 'DE', 'Germany', 'BBVA', '', 'com.bbva.germany', true, 0, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('HUAWEI|DE|DEUTSCHE_BANK', 'Huawei', 'DE', 'Germany', 'Deutsche Bank', '', 'com.db.pwcc.dbmobile', false, 1, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('HUAWEI|DE|COMMERZBANK', 'Huawei', 'DE', 'Germany', 'Commerzbank', '', 'de.commerzbanking.mobil', false, 2, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('HUAWEI|DE|SPARKASSE', 'Huawei', 'DE', 'Germany', 'Sparkasse', '', 'com.starfinanz.smob.android.sfinanzstatus', false, 3, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),
  catalogSeed_('HUAWEI|DE|ING', 'Huawei', 'DE', 'Germany', 'ING Germany', '', 'de.ingdiba.bankingapp', false, 4, 'BANK', 'COUNTRY_BANKS', 'RETAIL'),

  catalogSeed_('ANDROID|IT|HYPE', 'Android', 'IT', 'Italy', 'HYPE', 'it.hype.app', 'it.hype.app', false, 0, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|IT|SATISPAY', 'Android', 'IT', 'Italy', 'Satispay', 'com.satispay.customer', 'com.satispay.customer', false, 1, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|IT|N26', 'Android', 'IT', 'Italy', 'N26', 'de.number26.android', 'de.number26.android', false, 2, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|IT|REVOLUT', 'Android', 'IT', 'Italy', 'Revolut', 'com.revolut.revolut', 'com.revolut.revolut', false, 3, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|IT|HYPE', 'iOS', 'IT', 'Italy', 'HYPE', '943405905', '', false, 0, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|IT|SATISPAY', 'iOS', 'IT', 'Italy', 'Satispay', '790287076', '', false, 1, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|IT|N26', 'iOS', 'IT', 'Italy', 'N26', '956857223', '', false, 2, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|IT|REVOLUT', 'iOS', 'IT', 'Italy', 'Revolut', '932493382', '', false, 3, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),

  catalogSeed_('ANDROID|DE|N26', 'Android', 'DE', 'Germany', 'N26', 'de.number26.android', 'de.number26.android', false, 0, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|DE|REVOLUT', 'Android', 'DE', 'Germany', 'Revolut', 'com.revolut.revolut', 'com.revolut.revolut', false, 1, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|DE|TRADE_REPUBLIC', 'Android', 'DE', 'Germany', 'Trade Republic', 'de.traderepublic.app', 'de.traderepublic.app', false, 2, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|DE|C24', 'Android', 'DE', 'Germany', 'C24', 'de.c24.bankapp', 'de.c24.bankapp', false, 3, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|DE|N26', 'iOS', 'DE', 'Germany', 'N26', '956857223', '', false, 0, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|DE|REVOLUT', 'iOS', 'DE', 'Germany', 'Revolut', '932493382', '', false, 1, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|DE|TRADE_REPUBLIC', 'iOS', 'DE', 'Germany', 'Trade Republic', '1410703839', '', false, 2, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|DE|C24', 'iOS', 'DE', 'Germany', 'C24', '1497319731', '', false, 3, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),

  catalogSeed_('ANDROID|MX|NU', 'Android', 'MX', 'Mexico', 'Nu', 'com.nu.production', 'com.nu.production', false, 0, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|MX|MERCADO_PAGO', 'Android', 'MX', 'Mexico', 'Mercado Pago', 'com.mercadopago.wallet', 'com.mercadopago.wallet', false, 1, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|MX|KLAR', 'Android', 'MX', 'Mexico', 'Klar', 'mx.klar.app', 'mx.klar.app', false, 2, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|MX|STORI', 'Android', 'MX', 'Mexico', 'Stori', 'ai.powerup.stori', 'ai.powerup.stori', false, 3, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|MX|NU', 'iOS', 'MX', 'Mexico', 'Nu', '814456780', '', false, 0, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|MX|MERCADO_PAGO', 'iOS', 'MX', 'Mexico', 'Mercado Pago', '925436649', '', false, 1, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|MX|KLAR', 'iOS', 'MX', 'Mexico', 'Klar', '1472755899', '', false, 2, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|MX|STORI', 'iOS', 'MX', 'Mexico', 'Stori', '1486481718', '', false, 3, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),

  catalogSeed_('ANDROID|AR|UALA', 'Android', 'AR', 'Argentina', 'Uala', 'ar.com.bancar.uala', 'ar.com.bancar.uala', false, 0, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|AR|MERCADO_PAGO', 'Android', 'AR', 'Argentina', 'Mercado Pago', 'com.mercadopago.wallet', 'com.mercadopago.wallet', false, 1, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|AR|NARANJA_X', 'Android', 'AR', 'Argentina', 'Naranja X', 'com.tarjetanaranja.ncuenta', 'com.tarjetanaranja.ncuenta', false, 2, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|AR|BRUBANK', 'Android', 'AR', 'Argentina', 'Brubank', 'com.brubank', 'com.brubank', false, 3, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|AR|UALA', 'iOS', 'AR', 'Argentina', 'Uala', '1279808159', '', false, 0, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|AR|MERCADO_PAGO', 'iOS', 'AR', 'Argentina', 'Mercado Pago', '925436649', '', false, 1, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|AR|NARANJA_X', 'iOS', 'AR', 'Argentina', 'Naranja X', '1452691757', '', false, 2, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|AR|BRUBANK', 'iOS', 'AR', 'Argentina', 'Brubank', '1295202448', '', false, 3, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),

  catalogSeed_('ANDROID|ES|REVOLUT', 'Android', 'ES', 'Spain', 'Revolut', 'com.revolut.revolut', 'com.revolut.revolut', false, 0, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|ES|N26', 'Android', 'ES', 'Spain', 'N26', 'de.number26.android', 'de.number26.android', false, 1, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|ES|IMAGIN', 'Android', 'ES', 'Spain', 'imagin', 'com.imaginbank.app', 'com.imaginbank.app', false, 2, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('ANDROID|ES|OPENBANK', 'Android', 'ES', 'Spain', 'Openbank', 'es.openbank.mobile', 'es.openbank.mobile', false, 3, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|ES|REVOLUT', 'iOS', 'ES', 'Spain', 'Revolut', '932493382', '', false, 0, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|ES|N26', 'iOS', 'ES', 'Spain', 'N26', '956857223', '', false, 1, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|ES|IMAGIN', 'iOS', 'ES', 'Spain', 'imagin', '1069665204', '', false, 2, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),
  catalogSeed_('IOS|ES|OPENBANK', 'iOS', 'ES', 'Spain', 'Openbank', '1217874244', '', false, 3, 'FINTECH', 'COUNTRY_FINTECHS', 'DIGITAL'),

  catalogSeed_('ANDROID|CO|NEQUI', 'Android', 'CO', 'Colombia', 'Nequi', 'com.nequi.MobileApp', 'com.nequi.MobileApp', false, 0, 'NEOBANK', 'COUNTRY_NEOBANKS', 'DIGITAL'),
  catalogSeed_('ANDROID|CO|DAVIPLATA', 'Android', 'CO', 'Colombia', 'DaviPlata', 'com.davivienda.daviplataapp', 'com.davivienda.daviplataapp', false, 1, 'NEOBANK', 'COUNTRY_NEOBANKS', 'DIGITAL'),
  catalogSeed_('ANDROID|CO|LULO', 'Android', 'CO', 'Colombia', 'Lulo', 'com.lulobank', 'com.lulobank', false, 2, 'NEOBANK', 'COUNTRY_NEOBANKS', 'DIGITAL'),
  catalogSeed_('ANDROID|CO|NU', 'Android', 'CO', 'Colombia', 'Nu', 'com.nu.production', 'com.nu.production', false, 3, 'NEOBANK', 'COUNTRY_NEOBANKS', 'DIGITAL'),
  catalogSeed_('IOS|CO|NEQUI', 'iOS', 'CO', 'Colombia', 'Nequi', '1075378688', '', false, 0, 'NEOBANK', 'COUNTRY_NEOBANKS', 'DIGITAL'),
  catalogSeed_('IOS|CO|DAVIPLATA', 'iOS', 'CO', 'Colombia', 'DaviPlata', '1100731780', '', false, 1, 'NEOBANK', 'COUNTRY_NEOBANKS', 'DIGITAL'),
  catalogSeed_('IOS|CO|LULO', 'iOS', 'CO', 'Colombia', 'Lulo', '1534359078', '', false, 2, 'NEOBANK', 'COUNTRY_NEOBANKS', 'DIGITAL'),
  catalogSeed_('IOS|CO|NU', 'iOS', 'CO', 'Colombia', 'Nu', '814456780', '', false, 3, 'NEOBANK', 'COUNTRY_NEOBANKS', 'DIGITAL')
]);
