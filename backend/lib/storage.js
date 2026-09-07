const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const isMock = !process.env.GCP_PROJECT_ID || process.env.GCP_PROJECT_ID === 'your-project-id';

let storage;
let bucket;
const tempUploadsPath = os.tmpdir();

if (!isMock) {
    storage = new Storage({
        projectId: process.env.GCP_PROJECT_ID,
    });
    const bucketName = process.env.GCS_BUCKET_NAME || 'privy-print-uploads';
    bucket = storage.bucket(bucketName);
} else {
    console.log(`Using Ephemeral Local Storage (OS Temp Dir): ${tempUploadsPath}`);
    // No need to create os.tmpdir(), it always exists.
}

const uploadFile = async (filePath, destination, mimeType) => {
    if (!isMock) {
        await bucket.upload(filePath, {
            destination,
            metadata: {
                contentType: mimeType,
            },
        });
    } else {
        const destPath = path.join(tempUploadsPath, destination);
        fs.copyFileSync(filePath, destPath);
        // Clean up the original formidable temp file if it's different
        if (filePath !== destPath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) { }
        }
    }
    return destination; // Return the path identifier for streaming later
};

const downloadStream = (fileName) => {
    if (!isMock) {
        return bucket.file(fileName).createReadStream();
    } else {
        const filePath = path.join(tempUploadsPath, fileName);
        if (!fs.existsSync(filePath)) {
            throw new Error("File not found in temporary storage");
        }
        return fs.createReadStream(filePath);
    }
};

const deleteFile = async (fileName) => {
    if (!isMock) {
        await bucket.file(fileName).delete();
    } else {
        const filePath = path.join(tempUploadsPath, fileName);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`[STORAGE] Purged temp file securely: ${fileName}`);
            } catch (err) {
                console.error(`[STORAGE] Failed to purge temp file: ${fileName}`, err);
            }
        }
    }
};

module.exports = {
    uploadFile,
    downloadStream,
    deleteFile,
    isMock
};
