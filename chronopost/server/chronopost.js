// ==========================================================================
//  chronopost.js — Construction de la requête SOAP d'expédition et lecture
//  de la réponse (n° de suivi + étiquette).
//
//  ⚠️  IMPORTANT : les codes produit/service et certains champs dépendent du
//  CONTRAT du client. Les valeurs ci-dessous sont les valeurs courantes de la
//  documentation Chronopost ShippingService, mais elles DOIVENT être vérifiées
//  avec le compte du client avant la mise en production. Tout est regroupé et
//  commenté ici pour être ajusté facilement.
// ==========================================================================

// Correspondance "service affiché dans l'app" -> code produit Chronopost.
// À CONFIRMER avec le contrat du client (peut varier selon les offres souscrites).
export const PRODUCT_CODES = {
  'Chrono 13':            '01',
  'Chrono 18':            '16',
  'Chrono Classic':       '44',
  'Chrono Relais 13':     '86',
  'Chrono Shop2Shop':     '4S',
  'Chrono International':  '17',
};

// Code de service additionnel (assurance, notifications…). '0' = aucun.
const DEFAULT_SERVICE = '0';

const xml = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Découpe "Nom Prénom" -> {name, name2}. Chronopost sépare parfois nom/prénom.
function splitName(full) {
  const t = String(full || '').trim();
  return { name: t.slice(0, 100), name2: '' };
}

/**
 * Construit l'enveloppe SOAP pour l'opération shippingV3 de ShippingServiceWS.
 * @param {object} p  données déjà normalisées (voir buildShippingRequest)
 * @returns {string}  enveloppe SOAP prête à être POSTée
 */
export function buildSoapEnvelope(p) {
  const sh = splitName(p.dest.nom);
  const productCode = PRODUCT_CODES[p.service] || '16';
  const weightGr = Math.max(1, Math.round(parseFloat(p.poids || '0') * 1000)); // kg -> g

  // Namespace de l'opération. Selon le WSDL Chronopost.
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cxf="http://cxf.shipping.soa.chronopost.fr/">
  <soapenv:Header/>
  <soapenv:Body>
    <cxf:shippingV3>
      <headerValue>
        <accountNumber>${xml(p.account)}</accountNumber>
        <idEmit>CHRO</idEmit>
        <subAccount>${xml(p.subAccount)}</subAccount>
      </headerValue>
      <shipperValue>
        <shipperName>${xml((p.sender.soc || p.sender.nom).slice(0, 100))}</shipperName>
        <shipperName2>${xml(p.sender.nom.slice(0, 100))}</shipperName2>
        <shipperAdress1>${xml(p.sender.adr.slice(0, 38))}</shipperAdress1>
        <shipperAdress2>${xml((p.sender.adr2 || '').slice(0, 38))}</shipperAdress2>
        <shipperZipCode>${xml(p.sender.cp)}</shipperZipCode>
        <shipperCity>${xml(p.sender.ville)}</shipperCity>
        <shipperCountry>FR</shipperCountry>
        <shipperContactName>${xml(p.sender.nom.slice(0, 100))}</shipperContactName>
        <shipperEmail>${xml(p.sender.mail || '')}</shipperEmail>
        <shipperPhone>${xml(p.sender.tel || '')}</shipperPhone>
      </shipperValue>
      <customerValue>
        <customerName>${xml((p.sender.soc || p.sender.nom).slice(0, 100))}</customerName>
        <customerAdress1>${xml(p.sender.adr.slice(0, 38))}</customerAdress1>
        <customerZipCode>${xml(p.sender.cp)}</customerZipCode>
        <customerCity>${xml(p.sender.ville)}</customerCity>
        <customerCountry>FR</customerCountry>
        <customerContactName>${xml(p.sender.nom.slice(0, 100))}</customerContactName>
        <customerEmail>${xml(p.sender.mail || '')}</customerEmail>
        <printAsSender>N</printAsSender>
      </customerValue>
      <recipientValue>
        <recipientName>${xml(sh.name)}</recipientName>
        <recipientName2>${xml((p.dest.soc || '').slice(0, 100))}</recipientName2>
        <recipientAdress1>${xml(p.dest.adr.slice(0, 38))}</recipientAdress1>
        <recipientAdress2>${xml((p.dest.adr2 || '').slice(0, 38))}</recipientAdress2>
        <recipientZipCode>${xml(p.dest.cp)}</recipientZipCode>
        <recipientCity>${xml(p.dest.ville)}</recipientCity>
        <recipientCountry>${xml(p.dest.countryCode || 'FR')}</recipientCountry>
        <recipientContactName>${xml(sh.name)}</recipientContactName>
        <recipientEmail>${xml(p.dest.mail || '')}</recipientEmail>
        <recipientPhone>${xml(p.dest.tel || '')}</recipientPhone>
        <recipientMobilePhone>${xml(p.dest.tel || '')}</recipientMobilePhone>
      </recipientValue>
      <refValue>
        <shipperRef>${xml((p.ref || '').slice(0, 35))}</shipperRef>
        <recipientRef>${xml((p.ref || '').slice(0, 35))}</recipientRef>
      </refValue>
      <skybillValue>
        <productCode>${xml(productCode)}</productCode>
        <service>${xml(DEFAULT_SERVICE)}</service>
        <weight>${(weightGr / 1000).toFixed(3)}</weight>
        <weightUnit>KGM</weightUnit>
        <insuredValue>${xml(Math.round((parseFloat(p.valeur || '0')) * 100))}</insuredValue>
        <insuredCurrency>EUR</insuredCurrency>
        <objectType>MAR</objectType>
        <content1>${xml((p.contenu || 'Vetements').slice(0, 100))}</content1>
      </skybillValue>
      <skybillParamsValue>
        <mode>${xml(p.labelFormat || 'PDF')}</mode>
      </skybillParamsValue>
      <password>${xml(p.password)}</password>
      <modeRetour>2</modeRetour>
      <numberOfParcel>1</numberOfParcel>
      <version>2.0</version>
      <multiParcel>N</multiParcel>
    </cxf:shippingV3>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// Lecture simple des champs utiles dans la réponse SOAP (sans dépendance XML).
function pick(xmlStr, tag) {
  const m = xmlStr.match(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

/**
 * Analyse la réponse SOAP de Chronopost.
 * @returns {{ok:boolean, tracking?:string, labelBase64?:string, errorCode?:string, errorMessage?:string}}
 */
export function parseSoapResponse(xmlStr) {
  const errorCode = pick(xmlStr, 'errorCode') || pick(xmlStr, 'codeError');
  const errorMessage = pick(xmlStr, 'errorMessage') || pick(xmlStr, 'faultstring');

  // errorCode "0" (ou vide) = succès chez Chronopost.
  if (errorCode && errorCode !== '0') {
    return { ok: false, errorCode, errorMessage: errorMessage || 'Erreur Chronopost' };
  }
  const tracking = pick(xmlStr, 'skybillNumber') || pick(xmlStr, 'reservationNumber');
  const labelBase64 = pick(xmlStr, 'skybill') || pick(xmlStr, 'pdfEtiquette');

  if (!tracking) {
    return { ok: false, errorCode: errorCode || 'NO_TRACKING', errorMessage: errorMessage || 'Réponse sans numéro de suivi' };
  }
  return { ok: true, tracking, labelBase64 };
}

/**
 * Normalise + valide la charge utile reçue du frontend.
 */
export function normalizePayload(body, env) {
  const sender = body.sender || {};
  const dest = body.dest || {};
  const need = (v) => typeof v === 'string' && v.trim().length > 0;

  const errors = [];
  ['nom', 'adr', 'cp', 'ville'].forEach(k => { if (!need(sender[k])) errors.push(`sender.${k}`); });
  ['nom', 'adr', 'cp', 'ville'].forEach(k => { if (!need(dest[k])) errors.push(`dest.${k}`); });
  if (!(parseFloat(body.poids) > 0)) errors.push('poids');
  if (errors.length) return { errors };

  const countryMap = { France: 'FR', Belgique: 'BE', Luxembourg: 'LU', Suisse: 'CH', Allemagne: 'DE', Espagne: 'ES', Italie: 'IT', 'Pays-Bas': 'NL' };

  return {
    data: {
      account: env.CHRONO_ACCOUNT,
      password: env.CHRONO_PASSWORD,
      subAccount: env.CHRONO_SUBACCOUNT || '',
      labelFormat: env.CHRONO_LABEL_FORMAT || 'PDF',
      sender,
      dest: { ...dest, countryCode: countryMap[dest.pays] || 'FR' },
      poids: body.poids,
      valeur: body.valeur,
      ref: body.ref,
      contenu: body.contenu,
      service: body.service,
    }
  };
}
