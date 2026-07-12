import { SignedXml } from 'xml-crypto';
import { readFileSync } from 'fs';

const cert = readFileSync('./test/fixtures/keys/sim-signing-cert.pem', 'utf8');
console.log('Cert starts with:', cert.substring(0, 50));
console.log('Cert is PEM:', cert.includes('-----BEGIN CERTIFICATE-----'));

// Test how xml-crypto handles publicCert in constructor
const sig = new SignedXml({ idMode: 'wssecurity', publicCert: cert });
console.log('sig.publicCert set:', !!sig.publicCert);

// Now let's see if we can manually find the key
const sig2 = new SignedXml({ idMode: 'wssecurity' });
sig2.keyInfoProvider = { getKey: () => Buffer.from(cert) };
console.log('keyInfoProvider.getKey returns buffer of length:', sig2.keyInfoProvider.getKey().length);

// Try to verify a signature
const testSignedXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" soap:mustUnderstand="true">
      <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><Reference URI="#_0"><Transforms><Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>test</DigestValue></Reference></SignedInfo><SignatureValue>test</SignatureValue></ds:Signature>
    </wsse:Security>
  </soap:Header>
  <soap:Body xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" wsu:Id="_0">test</soap:Body>
</soap:Envelope>`;

const sig3 = new SignedXml({ idMode: 'wssecurity', publicCert: cert });
sig3.keyInfoProvider = {
  getKey: function() {
    console.log('getKey called!');
    return Buffer.from(cert);
  }
};
try {
  sig3.loadSignature('<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><Reference URI="#_0"><Transforms><Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>test</DigestValue></Reference></SignedInfo><SignatureValue>test</SignatureValue></ds:Signature>');
  const valid = sig3.checkSignature(testSignedXml);
  console.log('Valid (expected false for tampered):', valid);
  console.log('Errors:', sig3.validationErrors);
} catch(e) {
  console.log('Error:', e.message);
}
