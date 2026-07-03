/**
 * AS4 Message module
 * Builds and parses AS4 SOAP messages (MIME multipart envelopes)
 *
 * The AS4 message is a multipart/related MIME message containing:
 * 1. SOAP Envelope with eb:Messaging header and WS-Security
 * 2. Payload (SBDH + UBL XML)
 */

/**
 * Get the document type identifier for Peppol BIS Billing 3.0
 */
function getDocumentTypeIdentifier(docType) {
  const type = docType === 'credit_note' || docType === 'CreditNote'
    ? 'CreditNote'
    : 'Invoice';
  const ns = `urn:oasis:names:specification:ubl:schema:xsd:${type}-2`;
  return `${ns}::${type}##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1`;
}

/**
 * Build a complete AS4 MIME multipart message
 * @param {Object} params
 * @param {string} params.messageId - Unique message ID (uuid@domain format)
 * @param {string} params.fromApId - Sending AP identifier (e.g. "POP000123")
 * @param {string} params.toApId - Receiving AP identifier
 * @param {string} params.senderParticipantId - C1 participant ID (e.g. "9914:SK2023456789")
 * @param {string} params.receiverParticipantId - C4 participant ID
 * @param {string} params.payload - The SBDH XML payload
 * @param {string} params.documentType - "invoice" or "credit_note"
 * @param {string} [params.processId] - Peppol process ID
 * @param {string} [params.timestamp] - ISO 8601 timestamp (defaults to now)
 * @returns {string} Complete MIME multipart AS4 message
 */
export function buildAS4Message(params) {
  const {
    messageId,
    fromApId,
    toApId,
    senderParticipantId,
    receiverParticipantId,
    payload,
    documentType = 'invoice',
    processId = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    timestamp = new Date().toISOString(),
  } = params;

  const isCreditNote = documentType === 'credit_note' || documentType === 'CreditNote';
  const docTypeUpper = isCreditNote ? 'CreditNote' : 'Invoice';
  const docTypeIdentifier = getDocumentTypeIdentifier(documentType);

  const boundary = 'MIME-Boundary';
  const contentId = 'payload@sender';

  // SOAP Envelope
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:eb="http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/"
               xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
               xmlns:xop="http://www.w3.org/2004/08/xop/include">
  <soap:Header>
    <eb:Messaging>
      <eb:UserMessage>
        <eb:MessageInfo>
          <eb:Timestamp>${esc(timestamp)}</eb:Timestamp>
          <eb:MessageId>${esc(messageId)}</eb:MessageId>
        </eb:MessageInfo>
        <eb:PartyInfo>
          <eb:From>
            <eb:PartyId type="urn:fdc:peppol.eu:2017:identifiers:ap">${esc(fromApId)}</eb:PartyId>
            <eb:Role>http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/initiator</eb:Role>
          </eb:From>
          <eb:To>
            <eb:PartyId type="urn:fdc:peppol.eu:2017:identifiers:ap">${esc(toApId)}</eb:PartyId>
            <eb:Role>http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/responder</eb:Role>
          </eb:To>
        </eb:PartyInfo>
        <eb:CollaborationInfo>
          <eb:AgreementRef>urn:fdc:peppol.eu:2017:agreements:tia:ap_provider</eb:AgreementRef>
          <eb:Service type="cenbii-procid-ubl">${esc(processId)}</eb:Service>
          <eb:Action>busdox-docid-qns::${esc(docTypeIdentifier)}</eb:Action>
        </eb:CollaborationInfo>
        <eb:PayloadInfo>
          <eb:PartInfo href="cid:${contentId}">
            <eb:PartProperties>
              <eb:Property name="originalSender">${esc(senderParticipantId)}</eb:Property>
              <eb:Property name="finalRecipient">${esc(receiverParticipantId)}</eb:Property>
            </eb:PartProperties>
          </eb:PartInfo>
        </eb:PayloadInfo>
      </eb:UserMessage>
    </eb:Messaging>
    <wsse:Security soap:mustUnderstand="true">
      <!-- Signature and certificate will be added by the security layer -->
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <xop:Include xmlns:xop="http://www.w3.org/2004/08/xop/include" href="cid:${contentId}"/>
  </soap:Body>
</soap:Envelope>`;

  // Assemble MIME multipart message
  const mimeMessage = `Content-Type: multipart/related; boundary="${boundary}"; type="application/xop+xml"

This is a multi-part message in MIME format.

--${boundary}
Content-Type: application/xop+xml; charset=UTF-8; type="text/xml"
Content-Transfer-Encoding: 8bit
Content-ID: <soap@ap.mojafaktura.sk>

${soapEnvelope}

--${boundary}
Content-Type: application/xml
Content-Transfer-Encoding: 8bit
Content-ID: <${contentId}>

${payload}

--${boundary}--`;

  return mimeMessage;
}

/**
 * Parse an AS4 MIME multipart message
 * Extracts the SOAP envelope and payload parts
 * @param {string} mimeMessage - The raw MIME multipart message
 * @returns {Object} Parsed AS4 message
 */
export function parseAS4Message(mimeMessage) {
  const result = {
    messageId: null,
    fromApId: null,
    toApId: null,
    senderParticipantId: null,
    receiverParticipantId: null,
    payload: null,
    timestamp: null,
    processId: null,
    documentTypeIdentifier: null,
  };

  // Extract the SOAP envelope part
  const soapMatch = mimeMessage.match(
    /<soap:Envelope[\s\S]*?<\/soap:Envelope>/
  );
  if (!soapMatch) {
    throw new Error('No SOAP Envelope found in AS4 message');
  }
  result.rawSoap = soapMatch[0];
  const soap = soapMatch[0];

  // Extract message ID
  const msgIdMatch = soap.match(/<eb:MessageId>(.*?)<\/eb:MessageId>/);
  if (msgIdMatch) result.messageId = msgIdMatch[1];

  // Extract timestamp
  const tsMatch = soap.match(/<eb:Timestamp>(.*?)<\/eb:Timestamp>/);
  if (tsMatch) result.timestamp = tsMatch[1];

  // Extract AP IDs from From/To sections
  const fromSection = soap.match(/<eb:From>[\s\S]*?<\/eb:From>/);
  if (fromSection) {
    const pidMatch = fromSection[0].match(/<eb:PartyId[^>]*>(.*?)<\/eb:PartyId>/);
    if (pidMatch) result.fromApId = pidMatch[1];
  }

  const toSection = soap.match(/<eb:To>[\s\S]*?<\/eb:To>/);
  if (toSection) {
    const pidMatch = toSection[0].match(/<eb:PartyId[^>]*>(.*?)<\/eb:PartyId>/);
    if (pidMatch) result.toApId = pidMatch[1];
  }

  // Extract participant IDs from PartProperties
  const senderMatch = soap.match(
    /<eb:Property name="originalSender">(.*?)<\/eb:Property>/
  );
  if (senderMatch) result.senderParticipantId = senderMatch[1];

  const receiverMatch = soap.match(
    /<eb:Property name="finalRecipient">(.*?)<\/eb:Property>/
  );
  if (receiverMatch) result.receiverParticipantId = receiverMatch[1];

  // Extract process ID
  const procMatch = soap.match(
    /<eb:Service[^>]*>(.*?)<\/eb:Service>/
  );
  if (procMatch) result.processId = procMatch[1];

  // Extract document type identifier from Action
  const actionMatch = soap.match(/<eb:Action>(.*?)<\/eb:Action>/);
  if (actionMatch) {
    const action = actionMatch[1];
    // Remove "busdox-docid-qns::" prefix if present
    result.documentTypeIdentifier = action.replace(/^busdox-docid-qns::/, '');
  }

  // Extract the payload (SBDH) from the attachment
  const payloadMatch = mimeMessage.match(
    /Content-ID: <payload@sender>[\s\S]*?(?:--)?MIME-Boundary(?:--)?/
  );
  if (payloadMatch) {
    const payloadContent = payloadMatch[0];
    // Extract XML after the headers
    const xmlStart = payloadContent.indexOf('<?xml');
    if (xmlStart >= 0) {
      result.payload = payloadContent.substring(xmlStart);
      // Remove trailing boundary
      result.payload = result.payload.replace(/--MIME-Boundary.*$/m, '').trim();
    }
  }

  return result;
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
