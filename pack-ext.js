const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ChromeExtension = require('crx');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PEM_FILE = path.join(ROOT_DIR, 'key.pem');
const CRX_FILE = path.join(ROOT_DIR, 'extension.crx');

async function packExtension() {
    if (!fs.existsSync(DIST_DIR)) {
        console.error(`Error: The directory ${DIST_DIR} does not exist.`);
        process.exit(1);
    }

    let privateKey;

    if (fs.existsSync(PEM_FILE)) {
        console.log(`Using existing key: ${PEM_FILE}`);
        privateKey = fs.readFileSync(PEM_FILE);
    } else {
        console.log('No .pem file found. Generating a new 2048-bit RSA private key...');
        const keyPair = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' } // Chrome requires PKCS#1 format
        });

        privateKey = keyPair.privateKey;
        fs.writeFileSync(PEM_FILE, privateKey);
        console.log(`Generated and saved new key to: ${PEM_FILE}`);
    }

    const crx = new ChromeExtension({
        privateKey: privateKey
    });

    try {
        console.log(`Loading extension from: ${DIST_DIR}`);
        await crx.load(DIST_DIR);

        console.log('Packing extension...');
        const crxBuffer = await crx.pack();

        fs.writeFileSync(CRX_FILE, crxBuffer);
        console.log(`Successfully packed extension to: ${CRX_FILE}`);
    } catch (error) {
        console.error('Failed to pack extension:', error);
        process.exit(1);
    }
}

packExtension();