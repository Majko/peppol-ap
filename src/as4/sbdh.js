/**
 * SBDH (Standard Business Document Header) module
 * Builds and parses Peppol SBDH envelopes
 *
 * The SBDH wraps every Peppol business document with routing metadata:
 * - Sender/Receiver participant IDs
 * - Document type identification
 * - Business scope (process ID, document ID)
 */

import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true,
};

const SBDH_NS =
  'http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader';

/**
 * Build a complete SBDH XML string with a UBL document embedded
 * @param {Object} params
 * @param {string} params.senderId - e.g. "9914:SK2023456789"
 * @param {string} params.receiverId - e.g. "0088:SK4498765432"
 * @param {string} params.instanceIdentifier - UUID for this transmission
 * @param {string} params.creationDateAndTime - ISO 8601
 * @param {string} params.documentType - "Invoice" or "CreditNote"
 * @param {string} params.documentTypeIdentifier - Full Peppol document type ID
 * @param {string} params.processID - Peppol process ID
 * @param {string} params.countryC1 - Country code of Corner 1
 * @param {string} [params.ublXml] - Optional UBL XML to embed
 * @returns {string} SBDH XML
 */
export function buildSBDH(params) {
  const {
    senderId,
    receiverId,
    instanceIdentifier,
    creationDateAndTime,
    documentType = 'Invoice',
    documentTypeIdentifier,
    processID,
    countryC1 = 'SK',
    ublXml,
  } = params;

  // Split sender/receiver into scheme and value
  const [senderScheme, senderValue] = splitParticipantID(senderId);
  const [receiverScheme, receiverValue] = splitParticipantID(receiverId);

  const standard = `urn:oasis:names:specification:ubl:schema:xsd:${documentType === 'CreditNote' ? 'CreditNote' : 'Invoice'}-2`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<StandardBusinessDocument xmlns="${SBDH_NS}">
  <StandardBusinessDocumentHeader>
    <HeaderVersion>1.0</HeaderVersion>
    <Sender>
      <Identifier Authority="iso6523-actorid-upis">${esc(senderId)}</Identifier>
    </Sender>
    <Receiver>
      <Identifier Authority="iso6523-actorid-upis">${esc(receiverId)}</Identifier>
    </Receiver>
    <DocumentIdentification>
      <Standard>${esc(standard)}</Standard>
      <TypeVersion>2.1</TypeVersion>
      <InstanceIdentifier>${esc(instanceIdentifier)}</InstanceIdentifier>
      <Type>${esc(documentType)}</Type>
      <CreationDateAndTime>${esc(creationDateAndTime)}</CreationDateAndTime>
    </DocumentIdentification>
    <BusinessScope>
      <Scope>
        <Type>DOCUMENTID</Type>
        <InstanceIdentifier>${esc(documentTypeIdentifier)}</InstanceIdentifier>
        <Identifier>busdox-docid-qns</Identifier>
      </Scope>
      <Scope>
        <Type>PROCESSID</Type>
        <InstanceIdentifier>${esc(processID)}</InstanceIdentifier>
        <Identifier>cenbii-procid-ubl</Identifier>
      </Scope>
      <Scope>
        <Type>COUNTRY_C1</Type>
        <InstanceIdentifier>${esc(countryC1)}</InstanceIdentifier>
      </Scope>
    </BusinessScope>
  </StandardBusinessDocumentHeader>
  ${ublXml || ''}
</StandardBusinessDocument>`;

  return xml;
}

/**
 * Parse an SBDH XML string and extract the header metadata
 * @param {string} xmlString
 * @returns {Object} Parsed SBDH metadata
 */
export function parseSBDH(xmlString) {
  const parser = new XMLParser(XML_OPTIONS);
  const doc = parser.parse(xmlString);

  const sbdh = doc['StandardBusinessDocument']
    ? doc['StandardBusinessDocument']['StandardBusinessDocumentHeader']
    : doc['StandardBusinessDocumentHeader'];

  if (!sbdh) {
    // Try directly
    throw new Error('No StandardBusinessDocumentHeader found');
  }

  const result = {};

  // Extract sender
  const sender = getVal(sbdh, 'Sender', 'Identifier', '#text') ||
                 getVal(sbdh, 'Sender', 'Identifier');
  if (sender) {
    result.senderId = sender;
    // Try to extract the Authority
    const auth = getVal(sbdh, 'Sender', 'Identifier', '@_Authority');
    result.senderAuthority = auth;
  }

  // Extract receiver
  const receiver = getVal(sbdh, 'Receiver', 'Identifier', '#text') ||
                   getVal(sbdh, 'Receiver', 'Identifier');
  if (receiver) {
    result.receiverId = receiver;
    const auth = getVal(sbdh, 'Receiver', 'Identifier', '@_Authority');
    result.receiverAuthority = auth;
  }

  // Extract document identification
  const docId = getVal(sbdh, 'DocumentIdentification');
  if (docId) {
    result.instanceIdentifier = getVal(docId, 'InstanceIdentifier', '#text') ||
                                getVal(docId, 'InstanceIdentifier');
    result.standard = getVal(docId, 'Standard', '#text') ||
                      getVal(docId, 'Standard');
    result.typeVersion = getVal(docId, 'TypeVersion', '#text') ||
                         getVal(docId, 'TypeVersion');
    result.documentType = getVal(docId, 'Type', '#text') ||
                          getVal(docId, 'Type');
    result.creationDateAndTime = getVal(docId, 'CreationDateAndTime', '#text') ||
                                 getVal(docId, 'CreationDateAndTime');
  }

  // Extract business scopes
  const scopes = ensureArray(getVal(sbdh, 'BusinessScope', 'Scope'));
  for (const scope of scopes) {
    const type = getVal(scope, 'Type', '#text') || getVal(scope, 'Type');
    const instanceId = getVal(scope, 'InstanceIdentifier', '#text') ||
                       getVal(scope, 'InstanceIdentifier');

    if (type === 'DOCUMENTID') {
      result.documentTypeIdentifier = instanceId;
    } else if (type === 'PROCESSID') {
      result.processID = instanceId;
    } else if (type === 'COUNTRY_C1') {
      result.countryC1 = instanceId;
    }
  }

  return result;
}

/**
 * Build a full SBDH document with an embedded UBL payload
 * @param {Object} sbdhParams - Same as buildSBDH params
 * @param {string} ublXml - The UBL XML to embed
 * @returns {string} Complete SBDH XML document
 */
export function wrapInSBDH(sbdhParams, ublXml) {
  return buildSBDH({ ...sbdhParams, ublXml });
}

/**
 * Split a participant ID like "9914:SK2023456789" into scheme and value
 */
function splitParticipantID(id) {
  if (!id || !id.includes(':')) {
    return ['iso6523-actorid-upis', id || ''];
  }
  const colonIndex = id.indexOf(':');
  return [id.substring(0, colonIndex), id.substring(colonIndex + 1)];
}

/**
 * Escape XML special characters
 */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Safe get value from nested object
 */
function getVal(obj, ...keys) {
  for (const key of keys) {
    if (obj == null) return undefined;
    obj = obj[key];
  }
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj);
    const hasOnlyAttrs = keys.length > 0 && keys.every((k) => k.startsWith('@_'));
    if (hasOnlyAttrs) return '';
  }
  return obj;
}

/**
 * Ensure a value is an array
 */
function ensureArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}
