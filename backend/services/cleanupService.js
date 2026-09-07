const fs = require('fs');
const path = require('path');
const os = require('os');
const { getExpiredDocuments, deleteMetadata } = require('../lib/db');
const { isMock, deleteFile } = require('../lib/storage');

const getUploadsDir = () => os.tmpdir();

const deleteLocalFileSafe = (fileName) => {
    return new Promise((resolve) => {
        if (!fileName) return resolve(false);

        const uploadsDir = getUploadsDir();
        const filePath = path.join(uploadsDir, fileName);

        // SAFE CHECK 1: Prevent path traversal
        if (!filePath.startsWith(uploadsDir)) {
            console.error(`[Cleanup] Error: Attempted path traversal for file ${fileName}`);
            return resolve(false);
        }

        // SAFE CHECK 2: Ensure file exists before deleting
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) {
                    // Backward safety: Ignore if error is ENOENT
                    if (err.code === 'ENOENT') {
                        resolve(true);
                    } else {
                        console.error(`[Cleanup] File delete error for ${fileName}:`, err);
                        resolve(false);
                    }
                } else {
                    resolve(true);
                }
            });
        } else {
            resolve(true); // Already deleted or doesn't exist
        }
    });
};

const runCleanup = async () => {
    try {
        const expiredDocs = await getExpiredDocuments();
        if (!expiredDocs || expiredDocs.length === 0) return;

        console.log(`[Cleanup] Found ${expiredDocs.length} expired document(s). Starting cleanup...`);

        let deletedFilesCount = 0;
        let errorsCount = 0;

        // Loop through each expired document
        for (const doc of expiredDocs) {
            try {
                const files = doc.files || [];

                // Fallback for older document formats
                if (doc.gcsFileName && files.length === 0) {
                    files.push({ gcsFileName: doc.gcsFileName });
                }

                // Loop through document files
                for (const file of files) {
                    const fileName = file.gcsFileName || file.id;
                    if (!fileName) continue;

                    if (isMock) {
                        // Delete using safe local checks
                        const deleted = await deleteLocalFileSafe(fileName);
                        if (deleted) {
                            console.log(`[Cleanup] Deleted physical file safely: ${fileName}`);
                            deletedFilesCount++;
                        } else {
                            errorsCount++;
                        }
                    } else {
                        // Fallback to Google Cloud Storage deletion
                        try {
                            await deleteFile(fileName);
                            console.log(`[Cleanup] Deleted GCS file: ${fileName}`);
                            deletedFilesCount++;
                        } catch (err) {
                            // Ignore missing files to avoid crashes
                            if (err.code !== 404) {
                                console.error(`[Cleanup] Error deleting GCS file ${fileName}:`, err);
                                errorsCount++;
                            }
                        }
                    }
                }

                // ATOMIC BEHAVIOR: Remove metadata ONLY after attempting file deletion
                await deleteMetadata(doc.code);
                console.log(`[Cleanup] Removed metadata for expired document: ${doc.code}`);

            } catch (docErr) {
                console.error(`[Cleanup] Error processing document ${doc.code}:`, docErr);
                errorsCount++;
            }
        }

        console.log(`[Cleanup] Run Complete. Files deleted: ${deletedFilesCount}, Errors: ${errorsCount}`);
    } catch (err) {
        console.error('[Cleanup] Fatal error during cleanup run:', err);
    }
};

const startScheduler = () => {
    console.log('[Cleanup] Scheduler started. Checking for expired files every 1 minute...');

    // Run cleanup every 1 minute (60000 ms)
    setInterval(() => {
        runCleanup().catch(err => console.error('[Cleanup] Scheduler error:', err));
    }, 60000);

    // Check once on startup
    runCleanup().catch(err => console.error('[Cleanup] Startup cleanup error:', err));
};

module.exports = {
    runCleanup,
    startScheduler
};
