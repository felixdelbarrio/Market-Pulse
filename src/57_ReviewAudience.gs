// Evidence is evaluated in the original text. An app name or storefront is not evidence.
const MARKETS_REVIEW_AUDIENCE_VERSION = 2;
const MARKETS_REVIEW_AUDIENCE_RULES = {
  businessUse: /\b(?:ticari faaliyet goster\w*|(?:operamos|opero) como empresa|(?:soy|somos) (?:autonom[oa]s?|comerciantes?|una empresa)|remesa salarial|(?:pago|pagos|remesas|transferencias) masiv[oa]s|(?:firmas?|permisos?) (?:corporativas?|mancomunadas?|de apoderados)|(?:emision|cobro) (?:masiv[oa] )?de recibos|(?:cartas? de credito|financiacion (?:para pymes|comercial)|conciliacion bancaria|gestion de tesoreria|declaracion (?:de iva|de aduanas)|pagos? (?:aduaneros?|de comercio exterior)|domiciliaciones? empresariales?|cuentas? de comercio exterior)|(?:mi|nuestro|nuestra|uso|utilizo|integro|no puedo (?:usar|conectar|subir|cargar)) (?:el |la |los |las )?(?:tpv|pos|datafono|h2h|erp|api(?: bancaria)?|ficheros? (?:bancarios?|de remesas)|confirming|factoring)|(?:sanal posum|pos cihazim|kurumsal kartim)\w*)\b/u,
  personalUse: /\b(?:aile kart\w*|kendi maas\w*|(?:bireysel|kisisel) (?:hesa[bp]\w*|kart\w*)|bireysel olarak|ticari degil\w*|(?:mi|nuestra|una|la) (?:tarjeta familiar|cuenta personal|cuenta universitaria|pension)|soy (?:estudiante|pensionista|jubilad[oa])|(?:ben )?ogrenciyim|alquiler de mi casa)\b/u,
  operation: /\b(?:login|iniciar sesion|entrar|acceder|registrarme|contrasena|clave|otp|mfa|biometr\w*|huella|softtoken|sesion|giris\w*|sifre\w*|parmak izi|oturum\w*|extractos?|movimientos?|saldos?|recibos?|comprobantes?|domicili\w*|notifica\w*|adeudos?|dekont\w*|bildirim\w*|bakiye\w*|hesap hareket\w*|ekstre\w*|actualiza\w*|guncelle\w*|menu\w*|buscador|accesibilidad|pantalla\w*|ekran\w*|destinatari\w*|beneficiari\w*|atencion al cliente|soporte tecnico|servicio al cliente|randevu\w*|sube\w*|musteri hizmet\w*|canli destek|iban|sepa|bizum|pse|yape|plin)\b/u,
  issue: /\b(?:no (?:me |se |nos )?(?:puedo|puede|funciona|abre|carga|llega|muestra\w*|aparece\w*|deja|reconoce|recibo|encuentro)|falla\w*|error\w*|no sale\w*|no he podido|no deja\w*|rechaza\w*|falta\w*|no disponible|bloque\w*|no consigo|entra en bucle|(?:se|me) (?:cierra|cuelga|congela|queda en blanco)|muy lent[oa]|tarda\w*|crash\w*|keeps closing|unable to|cannot|acilmiyor|girmiyor|giremiyorum|yapamiyorum|olmuyor|calismiyor|gelmiyor|goremiyorum|gorunmuyor|donuyor|kapaniyor|atiyor|cok yavas|bekletiyor|hata\w*|basarisiz|ulasilamiyor|baglanamiyorum)\b/u,
  direct: [
    /\b(?:cuentas? (?:de (?:mi |nuestra |la )?empresas?|de negocios?|empresarial(?:es)?|comercial(?:es)?|pyme)|(?:tarjeta|banca) (?:de (?:mi |nuestra )?empresas?|corporativa|para empresas)|(?:pago|pagos|pagar|transferencias) a (?:mis |nuestros )?(?:empleados|proveedores)|(?:facturas? a|cobrar a) mis clientes|(?:nominas? de (?:mi |nuestra )?empresa|nominas? de mis empleados)|(?:seguro|alquiler|iva) de (?:mi|nuestro) (?:comercio|negocio|empresa)|suscripcion de software de mi empresa|gestion de tesoreria|conciliacion de cobros|terminal de cobro)\b/u,
    /\b(?:(?:business|corporate|merchant) (?:bank account|account|card|loan)|payroll processing|paying (?:my |our )?employees|supplier payments|merchant settlement|cash pooling|invoic\w* (?:my|our) (?:customers|clients))\b/u,
    /\b(?:conta (?:empresarial|pj)|folha de pagamento|pag\w* (?:aos |meus )?(?:funcionarios|fornecedores)|emit\w* nota fiscal)\b/u,
    /\b(?:ticari (?:hesa[bp]\w*|kredi\w*|kart\w*)|(?:sirket|isletme) (?:hesab\w*|kredi\w*)|(?:esnaf|kobi) kred\w*|(?:sirket\w*|isletme\w*) (?:yurtdisindan |duzenli olarak )?tahsilat\w*|sirket(?:im|imiz)\w* (?:\w+ ){0,6}(?:tahsilat\w*|tedarikci\w*|ihracat\w*)|tedarikci\w* (?:\w+ ){0,2}ode\w*|ihracat finansman\w*|e fatura (?:kes\w*|entegrasyon\w*)|(?:sanal pos|pos cihaz\w*) (?:basvur\w*|kurulum\w*|entegrasyon\w*|odeme al\w*))\b/u
  ],
  context: /\b(?:(?:mi|nuestro|nuestra) (?:empresa|negocio|comercio|pyme)|(?:soy|como) (?:autonom[oa]|comerciante|profesional independiente)|(?:my|our) (?:business|company)|self employed|(?:minha|nossa) empresa|(?:sirketim|isletmem)\w*|isletme sahib\w*|(?:esnaf|kobi)(?:yim|yiz|nin|m|im|imiz)?|ticari)\b/u,
  banking: /\b(?:transfer\w*|traspas\w*|enviar dinero|spei|eft|havale\w*|swift|fast odeme\w*|(?:para|havale) gonder\w*|pix|pag[oa]\w*|cobr[oa]\w*|odeme\w*|hesa[bp]\w*|cuentas?|accounts?|contas?|tarjetas?|cards?|cartao|kart\w*|impuestos?|iva|tax(?:es)?|vergi\w*|factur\w*|fatura\w*|credit\w*|kredi\w*|prestam\w*|loans?|emprest\w*)\b/u,
  action: /\b(?:no puedo|no (?:abre|funciona|llega|deja)|puedo|falla\w*|error\w*|comisi\w*|cobr\w*|pag\w*|envi\w*|hac\w*|abr\w*|bloque\w*|gestion\w*|emit\w*|recib\w*|deposit\w*|fail\w*|can(?:not| t)|unable|charge\w*|fee\w*|pay\w*|send\w*|receiv\w*|open\w*|block\w*|yap\w*|gonder\w*|acil\w*|ac(?:am|mak|tim)\w*|al(?:am|in|iyor)\w*|ucret\w*|komisyon\w*|masraf\w*|kes\w*|od[ea]\w*|basvur\w*|limit\w*)\b/u,
  pension: /\b(?:(?:soy|estoy) (?:jubilad[oa]|pensionista)|mi (?:jubilacion|pension)|emekli (?:maasim\w*|olmama|musterinizim)|emekliyim|(?:minha|recebo) aposentadoria|i am (?:retired|a pensioner)|my pension)\b/u,
  personalContext: /\b(?:(?:a |para )mi (?:hij[oa]|madre|padre|familia|espos[oa])|(?:to|for) my (?:family|son|daughter|mother|father|wife|husband)|(?:mi|nuestra) (?:casa|vivienda)|(?:my|our) (?:home mortgage|mortgage|rent)|(?:minha|nossa) (?:casa|familia)|konut kred\w*|alisveris\w*|pago de mi nomina)\b/u,
  retail: /\b(?:cuentas? (?:de (?:la )?)?nominas?|cuentas? sueldo|conta salario|salary account|maas hesab\w*|prestamos? personal(?:es)?|creditos? (?:personal(?:es)?|al consumo)|personal loans?|consumer credit|ihtiyac kredisi|bireysel kredi|kisisel kredi|cuentas? (?:infantil(?:es)?|personal(?:es)?)|para uso personal|(?:uso|utilizo) (?:la app )?personal y|tarjeta (?:personal|de estudiante)|student card|seguro de (?:mi )?hogar|home insurance|alquiler de (?:mi|nuestra) vivienda|(?:transferir|enviar dinero) a mi hij[oa]|(?:recibo|factura) (?:de (?:luz|gas|internet) de mi casa|del hogar)|(?:hipoteca|prestamo) (?:de|para) (?:mi|nuestra) vivienda|(?:ahorrar|ahorro) para (?:mi jubilacion|mis vacaciones)|(?:credito|prestamo) (?:para|de) (?:estudios|mi boda|mis vacaciones)|gastos (?:domesticos|familiares|personales)|(?:vacaciones|viaje personal) (?:de mi familia|en familia)|(?:netflix|spotify) (?:me cobra|subscription|abonelig\w*)|(?:cobro|pago|pagar|planes) (?:a |de )?(?:netflix|spotify)|suscripcion (?:personal|de netflix|de spotify)|ev kira(?:si|m)\w*|ogrenci kart\w*|ogrenci (?:hesa[bp]\w*|kred\w*|burs\w*)|(?:ogrenciyim|universite ogrencisi) (?:\w+ ){0,5}(?:burs\w*|harc\w*|kartim\w*)|(?:mi|para mi) (?:beca|prestamo estudiantil)|cuenta (?:para |de )?estudiantes|student (?:loan|bank account))\b/u,
  salaryReceived: /\b(?:mi nomina|mi salario|mi sueldo|my (?:paycheck|salary|wages)|meu salario|maasim\w*|maas musterisi\w*|maasli musteriyim|(?:recib\w*|cobr\w*|deposit\w*|ingres\w*|acredit\w*) (?:\w+ ){0,4}(?:la nomina|nomina|(?:el )?pago de (?:mi |la )?nomina))\b/u,
  turkishSalaryCustomer: /\b(?:maas (?:musterisi\w*|bankam\w*|kartim\w*|promosyonum\w*|aldigim|aldigimiz|aliyorum|aliyoruz|almakta(?:yim|yiz)|odememi (?:al\w*|bekliyorum))|maasli (?:musteri\w*|calisanim|calisiyorum|personelim)|bordrolu (?:calisanim|calisiyorum|personelim)|(?:hesabima|hesabimiza) (?:\w+ ){0,3}maas (?:yat\w*|gel\w*))\b/u,
  negatedBusiness: /\b(?:no (?:soy|somos|tengo|tenemos|poseo|uso|utilizo|es) (?:una? )?(?:empresa|autonom[oa]|negocio|cuenta comercial|tarjeta corporativa)|not (?:a business|self employed|for (?:my |our )?business)|(?:sirket|esnaf|kobi) degilim|(?:ticari (?:hesabim|kartim) yok)|(?:ticari|sirket hesab\w*) degil)\b/u
};

const MARKETS_AUDIENCE_SHEET = 'RELEVANCE_RULES';
const MARKETS_AUDIENCE_HEADERS = ['RULE_ID', 'GROUP_KEY', 'PHRASE', 'ENABLED'];
const MARKETS_AUDIENCE_MAX_RULES = 64;
const MARKETS_AUDIENCE_CATALOGS = new WeakMap();

function marketsAudienceSeeds_() {
  return Object.keys(MARKETS_REVIEW_AUDIENCE_RULES).map(group => ['base-' + group, group, '', true]);
}

function validateMarketsAudienceRows_(rows) {
  const seeds = new Map(marketsAudienceSeeds_().map(row => [row[0], row[1]]));
  const ids = new Set(), phrases = new Set();
  if (rows.length > MARKETS_AUDIENCE_MAX_RULES) throw new Error('El catálogo supera su límite de reglas.');
  for (const [id, group, phrase, enabled] of rows) {
    const seed = seeds.has(id);
    if (typeof id !== 'string' || typeof group !== 'string' || !Object.hasOwn(MARKETS_REVIEW_AUDIENCE_RULES, group) || ids.has(id) ||
        typeof enabled !== 'boolean' || (seed ? seeds.get(id) !== group || phrase !== '' :
          !/^phrase-[a-z0-9-]{1,40}$/.test(id) || typeof phrase !== 'string' || phrase.length > 96 ||
          !/^[a-z0-9]{2,}(?: [a-z0-9]{2,}){1,7}$/.test(phrase) || !/[a-z]/.test(phrase) ||
          phrases.has(group + '|' + phrase))) throw new Error('Regla de audiencia inválida o duplicada: ' + id);
    ids.add(id);
    if (!seed) phrases.add(group + '|' + phrase);
  }
  if ([...seeds.keys()].some(id => !ids.has(id))) throw new Error('Faltan reglas de base en el catálogo de audiencia.');
}

function marketsAudienceCatalog_(ss, fresh = false) {
  if (!fresh && MARKETS_AUDIENCE_CATALOGS.has(ss)) return MARKETS_AUDIENCE_CATALOGS.get(ss);
  const sheet = ss.getSheetByName(MARKETS_AUDIENCE_SHEET);
  const seeds = marketsAudienceSeeds_();
  let rows = seeds;
  if (sheet) {
    const count = sheet.getLastRow() - 1;
    if (count < 1 || count > MARKETS_AUDIENCE_MAX_RULES) throw new Error('El catálogo de audiencia está vacío o supera su límite.');
    if (sheet.getLastColumn() !== MARKETS_AUDIENCE_HEADERS.length) throw new Error('Cabeceras incompatibles en ' + MARKETS_AUDIENCE_SHEET + '.');
    const values = sheet.getRange(1, 1, count + 1, MARKETS_AUDIENCE_HEADERS.length).getValues();
    assertCurrentSheetContract_(sheet, MARKETS_AUDIENCE_HEADERS, values[0]);
    rows = values.slice(1).map(row => row.slice(0, MARKETS_AUDIENCE_HEADERS.length));
    validateMarketsAudienceRows_(rows);
  }
  const disabled = rows.filter(([id, , , enabled]) => id.startsWith('base-') && !enabled).map(([, group]) => group).sort();
  const additions = rows.filter(([id, , , enabled]) => id.startsWith('phrase-') && enabled);
  const revision = disabled.length || additions.length
    ? marketsReviewDigest_([disabled, additions.map(([, group, phrase]) => [group, phrase])]) : '';
  const rules = { ...MARKETS_REVIEW_AUDIENCE_RULES };
  for (const group of Object.keys(rules)) {
    const extra = additions.filter(row => row[1] === group).map(row => row[2]);
    if (!disabled.includes(group) && !extra.length) continue;
    const patterns = disabled.includes(group) ? [] : [].concat(rules[group]);
    // Only normalized phrases enter this expression. It supports no admin-supplied regex operators.
    if (extra.length) patterns.push(new RegExp('\\b(?:' + extra.join('|') + ')\\b', 'u'));
    rules[group] = group === 'direct' ? patterns : {
      exec(text) {
        for (const pattern of patterns) {
          const match = pattern.exec(text);
          if (match) return match;
        }
        return null;
      },
      test: text => patterns.some(pattern => pattern.test(text))
    };
  }
  const catalog = { sheet, rows, rules, revision };
  if (!fresh) MARKETS_AUDIENCE_CATALOGS.set(ss, catalog);
  return catalog;
}

function marketsAudienceIndexVersion_(version, revision) {
  return revision ? version + ':' + revision : version;
}

function marketsAudienceMatchesFunctionalVersion_(saved, version) {
  return typeof saved === 'string' && (saved === version || saved.startsWith(version + ':'));
}

function writeMarketsAudienceRule_(ss, { key, value, expected }) {
  const { sheet, rows } = marketsAudienceCatalog_(ss, true);
  const index = rows.findIndex(row => row[0] === key);
  const old = rows[index];
  if ((old ? JSON.stringify(old) : '') !== expected) throw new Error('La regla cambió. Actualiza el catálogo.');
  if (!value || typeof value.phrase !== 'string' || value.phrase.length > 96 || !/^[\p{L}\p{M}\p{N} ]*$/u.test(value.phrase)) {
    throw new Error('Introduce una frase literal válida.');
  }
  const seed = old?.[0].startsWith('base-');
  if (seed && (value.group !== old[1] || value.phrase !== '')) throw new Error('Solo se puede cambiar el estado de una regla de base.');
  const row = [key, value.group, normalizeReviewEvidence_(value.phrase), value.enabled];
  if (index < 0) rows.push(row);
  else rows[index] = row;
  validateMarketsAudienceRows_(rows);
  if (sheet) {
    const number = index < 0 ? rows.length + 1 : index + 2;
    ensureSheetCapacity_(sheet, number, MARKETS_AUDIENCE_HEADERS.length);
    sheet.getRange(number, 1, 1, MARKETS_AUDIENCE_HEADERS.length).setValues([row]);
  } else {
    const target = ss.insertSheet(MARKETS_AUDIENCE_SHEET);
    try {
      target.getRange(1, 1, rows.length + 1, MARKETS_AUDIENCE_HEADERS.length).setValues([MARKETS_AUDIENCE_HEADERS, ...rows]);
    } catch (error) {
      // Keep the sheet for inspection if the outcome of the write is unknown.
      throw new Error('No se pudo confirmar la inicialización de ' + MARKETS_AUDIENCE_SHEET + '. ' + errorToString_(error));
    }
  }
  SpreadsheetApp.flush();
  MARKETS_AUDIENCE_CATALOGS.delete(ss);
}

function classifyMarketsReviewAudience_(original, rules = MARKETS_REVIEW_AUDIENCE_RULES) {
  const evidence = {};
  const clauses = String(original || '').split(/[.!?;\n]+|\b(?:pero|sin embargo|but|however|mas|porem|ama|ancak|fakat)\b/iu);
  const normalized = normalizeReviewEvidence_(original);
  evidence.retail = (rules.retail.exec(normalized) || rules.salaryReceived.exec(normalized) || rules.turkishSalaryCustomer.exec(normalized) ||
    rules.personalUse.exec(normalized) || rules.pension.exec(normalized) || rules.personalContext.exec(normalized))?.[0] || '';
  const salaryCustomer = rules.turkishSalaryCustomer.test(normalized) || /\bmaas (?:hesab\w*|musterisi\w*)\b|\bmaasim\w*\b/u.test(normalized);
  for (const text of clauses) {
    const clause = normalizeReviewEvidence_(text);
    if (!clause) continue;
    const banking = rules.banking.exec(clause)?.[0] || '';
    const feature = rules.operation.exec(clause)?.[0] || banking;
    const issue = rules.issue.exec(clause)?.[0];
    const action = rules.action.exec(clause)?.[0];
    const authorOperation = /\b(?:puedo|pagar|pago|pagamos|pague|envie|recibi|cobre|abri|yapamadim|gonderdim|gonderiyorum|gonderemiyorum|yaptim|al(?:am|in|iyor)\w*)\b/u.test(clause);
    const performance = /\b(?:app|aplicacion|movil|uygulama\w*)\b.*\b(lent[oa]|tarda\w*|cierra|bloque\w*|yavas|donuyor|kapaniyor)\b/u.exec(clause);
    if (!evidence.shared && ((feature && (issue || (authorOperation && banking && action !== banking))) ||
        (issue && /\b(?:entrar|acceder|giremiyorum|giris\w*)\b/u.test(clause)) || performance)) {
      evidence.shared = feature || performance?.[1] || issue;
    }

    if (evidence.business || rules.negatedBusiness.test(clause)) continue;
    const strong = rules.direct.map(pattern => pattern.exec(clause)?.[0]).find(Boolean);
    const personal = rules.retail.test(clause) || rules.salaryReceived.test(clause) || rules.turkishSalaryCustomer.test(clause) || rules.personalUse.test(clause) ||
      rules.pension.test(clause) || rules.personalContext.test(clause);
    const context = !personal && rules.context.exec(clause)?.[0];
    const bankStaff = /\b(?:calisanlariniz\w*|(?:banka|sube) (?:personel|calisan)\w*)\b/u.test(clause);
    const payrollMatch = MARKETS_REVIEW_PAYROLL.exec(clause)?.[0];
    // A generic reference to staff payroll can be the employee's complaint, including in the title.
    const employeePayroll = salaryCustomer && /^(?:personel|calisanlar\w*)\b/.test(payrollMatch || '') &&
      !/\b(?:personelimin|personelimizin|calisanlarimin|calisanlarimizin|oduyorum|oduyoruz|odeyemiyorum|odeyemiyoruz)\b/u.test(clause);
    const payroll = !personal && !bankStaff && !employeePayroll && payrollMatch;
    const fileOperation = issue && /\b(?:ficheros? (?:bancarios?|de remesas)|archivos? de remesas)\b/u.exec(clause)?.[0];
    const business = rules.businessUse.exec(clause)?.[0] || strong || payroll || fileOperation ||
      (context && action && banking && context !== 'ticari' ? context : '');
    if (business) evidence.business = business;
  }
  const sharedOperation = Boolean(evidence.shared);
  const mixedAccounts = evidence.retail && /\bbireysel olarak\b.*\bticari olarak (?:hesa[bp]\w*|ac\w*)\b/u.test(normalized);
  const audience = evidence.retail && (evidence.business || mixedAccounts) ? 'MIXED' : evidence.business ? 'BEI_CONFIRMED'
    : evidence.retail ? 'RETAIL' : 'UNDETERMINED';
  const relevance = evidence.business ? 'BUSINESS' : evidence.retail ? 'NONE'
    : sharedOperation ? 'TRANSVERSAL' : rules.operation.test(normalized) || rules.banking.test(normalized) ? 'UNCERTAIN' : 'NONE';
  const reason = audience === 'MIXED' ? (evidence.business ? 'explicit_business_with_retail' : 'mixed_account_context') : ({
    BUSINESS: 'business', TRANSVERSAL: 'shared_banking', UNCERTAIN: 'insufficient_context',
    NONE: evidence.retail ? 'personal_use' : 'insufficient_evidence'
  })[relevance];
  return { audience, relevance, sharedOperation, reason, evidence };
}

function matchesMarketsReviewAudience_(filter, decision) {
  if (!['BEI', 'BEI_ONLY', 'BEI_EXTENDED'].includes(filter)) return true;
  return decision.relevance === 'BUSINESS' || decision.relevance === 'TRANSVERSAL';
}
