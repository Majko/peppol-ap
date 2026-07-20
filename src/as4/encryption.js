/**
 * AS4 XML Encryption / Decryption module
 *
 * Handles decryption of incoming xenc:EncryptedData payloads in AS4 SOAP messages.
 * Uses the `xml-encryption` library (auth0/node-xml-encryption) for:
 *   - Decrypting the session key via xenc:EncryptedKey (RSA-OAEP)
 *   - Decrypting the payload via the recovered session key (AES-256-CBC)
 *
 * AS4 Peppol profile uses:
 *   - Key encryption: RSA-OAEP (or RSA-OAEP-256)
 *   - Content encryption: AES-256-CBC
 */

import { decrypt } from 'xml-encryption';
import { select } from 'xpath';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { simulationMode } from '../simulation.js';

const XENC_NS = 'http://www.w3.org/2001/04/xmlenc#';
const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';

/**
 * Decrypt an xenc:EncryptedData element inside a SOAP payload.
 *
 * Flow:
 *  1. Locate xenc:EncryptedData inside the SOAP body
 *  2. Locate the embedded xenc:EncryptedKey block (RSA-OAEP encrypted session key)
 *  3. Decrypt the session key using `privateKey` (RSA private key PEM)
 *  4. Decrypt the encrypted content using the recovered session key
 *  5. Replace the xenc:EncryptedData element with the decrypted XML in the DOM tree
 *
 * @param {string} soapEnvelope - SOAP envelope XML string containing an xenc:EncryptedData element
 * @param {string} privateKey   - RSA private key in PEM format (used to decrypt the session key)
 * @returns {Promise<string>} The SOAP envelope with EncryptedData replaced by decrypted XML
 * @throws {Error} If no encrypted data found, key decryption fails, or payload decryption fails
 */
export function decryptPayload(soapEnvelope, privateKey) {
  // Simulation mode: skip decryption — return envelope as-is
  if (simulationMode) {
    return Promise.resolve(soapEnvelope);
  }

  return new Promise((resolve, reject) => {
    const doc = new DOMParser().parseFromString(soapEnvelope, 'text/xml');

    // Find xenc:EncryptedData inside soap:Body
    const encryptedDatas = select(
      "//*[local-name(.)='Body']/*[local-name(.)='EncryptedData' and namespace-uri(.)='" + XENC_NS + "']",
      doc
    );

    if (!encryptedDatas || encryptedDatas.length === 0) {
      // No encryption — passthrough
      return resolve(soapEnvelope);
    }

    const encryptedData = encryptedDatas[0];

    // Extract the full EncryptedData element string for xml-encryption
    const serializer = new XMLSerializer();
    const encryptedDataXml = serializer.serializeToString(encryptedData);

    decrypt(encryptedDataXml, {
      key: privateKey,
      disallowEncryptionWithInsecureAlgorithm: false,
    }, (err, decrypted) => {
      if (err) {
        const msg = err.message || String(err);
        return reject(new Error(`Payload decryption failed: ${msg}`));
      }

      if (!decrypted) {
        return reject(new Error('Payload decryption returned empty result'));
      }

      // Parse the decrypted XML — strip all <?xml ...?> declarations
      // since parseFromString only supports one xml decl at document start
      let decryptedDoc;
      const strippedDecrypted = decrypted.replace(/<\?xml[^?]*\?>/gi, '').trim();
      try {
        decryptedDoc = new DOMParser().parseFromString(strippedDecrypted, 'text/xml');
      } catch (parseErr) {
        return reject(new Error(`Failed to parse decrypted payload as XML: ${parseErr.message}`));
      }

      // Import the decrypted node into the main document so we can replace
      const imported = doc.importNode(decryptedDoc.documentElement, true);

      // Replace the EncryptedData element with the decrypted content
      const parent = encryptedData.parentNode;
      if (!parent) {
        return reject(new Error('EncryptedData element has no parent node'));
      }

      // Replace in place
      parent.replaceChild(imported, encryptedData);

      // Serialize back to string
      const result = serializer.serializeToString(doc);
      return resolve(result);
    });
  });
}

/**
 * Check whether a SOAP envelope contains xenc:EncryptedData in the body.
 * Used by callers that need to know upfront whether decryption is required.
 *
 * @param {string} soapEnvelope - SOAP envelope XML string
 * @returns {boolean}
 */
export function isEncrypted(soapEnvelope) {
  return soapEnvelope.includes('xenc:EncryptedData');
}
