const express = require('express');
const formidable = require('formidable');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const os = require('os');
require('dotenv').config();

const { saveMetadata, getMetadata, deleteMetadata, extendExpiry, incrementPrintCount, incrementDownloadCount, incrementViewCount } = require('./lib/db');
const { uploadFile, downloadStream, deleteFile } = require('./lib/storage');
const { getNearbyShopsHandler } = require('./controllers/nearbyShops');
const { getShopsByCityHandler } = require('./controllers/cityShops');
const { startScheduler, runCleanup } = require('./services/cleanupService');

// Rate limit for nearby-shops
const nearbyRateLimit = new Map();
const nearbyRateWindow = 60 * 1000;
const nearbyRateMax = 10;
const nearbyRateMiddleware = (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'localhost';
    const now = Date.now();
    if (!nearbyRateLimit.has(ip)) {
        nearbyRateLimit.set(ip, { count: 1, resetAt: now + nearbyRateWindow });
        return next();
    }
    const lim = nearbyRateLimit.get(ip);
    if (now > lim.resetAt) {
        nearbyRateLimit.set(ip, { count: 1, resetAt: now + nearbyRateWindow });
        return next();
    }
    if (lim.count >= nearbyRateMax) {
        return res.status(429).json({ error: 'Too many requests. Please wait before searching again.' });
    }
    lim.count++;
    next();
};

// Rate limit for city-based shop search (separate from nearby-shops)
const cityShopsRateLimit = new Map();
const cityShopsRateWindow = 60 * 1000;
const cityShopsRateMax = 5; // Lower limit for city searches (more expensive)
const cityShopsRateMiddleware = (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'localhost';
    const now = Date.now();
    if (!cityShopsRateLimit.has(ip)) {
        cityShopsRateLimit.set(ip, { count: 1, resetAt: now + cityShopsRateWindow });
        return next();
    }
    const lim = cityShopsRateLimit.get(ip);
    if (now > lim.resetAt) {
        cityShopsRateLimit.set(ip, { count: 1, resetAt: now + cityShopsRateWindow });
        return next();
    }
    if (lim.count >= cityShopsRateMax) {
        return res.status(429).json({ error: 'Too many city search requests. Please wait before searching again.' });
    }
    lim.count++;
    next();
};

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({
    frameguard: false,
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
}));
// Allow requests from any origin (useful for local network device testing)
app.use(cors({ origin: '*' }));
app.use(express.json());

// Rate limiting for extend endpoint (simple in-memory store)
// In production, use Redis or a proper rate limiting library
const extendRateLimit = new Map();
const EXTEND_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const EXTEND_RATE_LIMIT_MAX = 5; // Max 5 extensions per minute per IP

const checkRateLimit = (req, res, next) => {
    // Get IP address - handle both IPv4 and IPv6, and localhost
    const ip = req.ip ||
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        'localhost';
    const now = Date.now();

    if (!extendRateLimit.has(ip)) {
        extendRateLimit.set(ip, { count: 1, resetAt: now + EXTEND_RATE_LIMIT_WINDOW });
        return next();
    }

    const limit = extendRateLimit.get(ip);

    // Reset if window expired
    if (now > limit.resetAt) {
        extendRateLimit.set(ip, { count: 1, resetAt: now + EXTEND_RATE_LIMIT_WINDOW });
        return next();
    }

    // Check if limit exceeded
    if (limit.count >= EXTEND_RATE_LIMIT_MAX) {
        return res.status(429).json({
            error: 'Too many extension requests. Please wait before trying again.'
        });
    }

    // Increment count
    limit.count++;
    next();
};

// Cleanup old rate limit entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, limit] of extendRateLimit.entries()) {
        if (now > limit.resetAt) {
            extendRateLimit.delete(ip);
        }
    }
}, 5 * 60 * 1000); // Cleanup every 5 minutes

const cspMiddleware = (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
};

function generateAccessCode() {
    return Math.floor(100000 + crypto.randomInt(900000)).toString();
}

app.get('/', (req, res) => {
    res.json({ status: 'Privy Print API is running', version: '1.0.2', timestamp: new Date().toISOString() });
});

// Test endpoint to verify extend route is available
app.get('/api/test/extend-route', (req, res) => {
    res.json({
        message: 'Extend expiry route is available',
        methods: ['PATCH', 'POST'],
        endpoint: '/api/document/extend/:code'
    });
});

// Nearby Secure Print Centers - isolated module
app.get('/api/nearby-shops', nearbyRateMiddleware, (req, res, next) => {
    // Wrap async handler to catch errors
    Promise.resolve(getNearbyShopsHandler(req, res)).catch((error) => {
        console.error('[nearby-shops route] Unhandled error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

// City-based shop search - isolated module
app.get('/api/shops-by-city', cityShopsRateMiddleware, (req, res, next) => {
    // Wrap async handler to catch errors
    Promise.resolve(getShopsByCityHandler(req, res)).catch((error) => {
        console.error('[shops-by-city route] Unhandled error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

const getMimeType = (filename, mimetype) => {
    if (mimetype && mimetype !== 'application/octet-stream') return mimetype;
    const ext = path.extname(filename || '').toLowerCase();
    const map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt': 'text/plain'
    };
    return map[ext] || mimetype || 'application/octet-stream';
};

app.post('/api/upload', async (req, res) => {
    const form = new formidable.IncomingForm({
        multiples: true,
        uploadDir: os.tmpdir(),
        keepExtensions: true,
        maxFileSize: 50 * 1024 * 1024 // 50MB limit for safe temporary memory
    });
    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(400).json({ error: 'File upload failed' });
        try {
            const uploadedFiles = files.file ? (Array.isArray(files.file) ? files.file : [files.file]) : [];
            if (uploadedFiles.length === 0) throw new Error('No files uploaded');

            const expiryMinutes = fields.expiry ? parseInt(fields.expiry[0]) : 5;
            let printLimit = null;
            if (fields.printLimit && fields.printLimit[0]) {
                const pl = parseInt(fields.printLimit[0], 10);
                if (Number.isInteger(pl) && pl >= 1 && pl <= 10) printLimit = pl;
            }

            let downloadLimit = null;
            if (fields.downloadLimit && fields.downloadLimit[0]) {
                const dl = parseInt(fields.downloadLimit[0], 10);
                if (Number.isInteger(dl) && dl >= 1) downloadLimit = dl;
            }

            let viewLimit = null;
            if (fields.viewLimit && fields.viewLimit[0]) {
                const vl = parseInt(fields.viewLimit[0], 10);
                if (Number.isInteger(vl) && vl >= 1 && vl <= 10) viewLimit = vl;
            }

            let fileLimits = {};
            if (fields.fileLimits && fields.fileLimits[0]) {
                try {
                    fileLimits = JSON.parse(fields.fileLimits[0]);
                } catch (e) {
                    console.error('Failed to parse fileLimits', e);
                }
            }

            // Get accessMode (default to PRINT)
            const accessMode = (fields.accessMode && fields.accessMode[0]) ? fields.accessMode[0] : 'PRINT';

            const code = generateAccessCode();
            const expiresAt = new Date(Date.now() + (expiryMinutes || 5) * 60000);

            const fileMetadata = [];
            for (let i = 0; i < uploadedFiles.length; i++) {
                const file = uploadedFiles[i];
                const extension = path.extname(file.originalFilename || '');
                const gcsFileName = `${code}_${i}${extension}`;
                const determinedMime = getMimeType(file.originalFilename, file.mimetype);
                await uploadFile(file.filepath, gcsFileName, determinedMime);

                let specificLimit = downloadLimit;
                if (fileLimits && fileLimits[file.originalFilename] !== undefined) {
                    const parsedLimit = parseInt(fileLimits[file.originalFilename], 10);
                    if (Number.isInteger(parsedLimit) && parsedLimit >= 1) {
                        specificLimit = parsedLimit;
                    }
                }

                fileMetadata.push({
                    fileName: file.originalFilename,
                    mimeType: determinedMime,
                    gcsFileName,
                    downloadLimit: specificLimit,
                    downloadCount: 0
                });
            }

            const metadata = {
                code,
                files: fileMetadata,
                createdAt: new Date(),
                expiresAt,
                status: 'active',
                printLimit: printLimit ?? null,
                printCount: 0,
                viewLimit: viewLimit ?? null,
                viewCount: 0,
                accessMode
            };
            await saveMetadata(metadata);
            res.json({
                code,
                expiresAt: expiresAt.toISOString(),
                success: true,
                printLimit: printLimit ?? null,
                downloadLimit: downloadLimit ?? null,
                viewLimit: viewLimit ?? null,
                accessMode
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to process upload' });
        }
    });
});

app.get('/api/document/verify/:code', async (req, res) => {
    const { code } = req.params;
    try {
        const metadata = await getMetadata(code);
        if (!metadata) return res.status(404).json({ error: 'Invalid access code' });
        const status = metadata.status || 'active';
        if (status === 'EXPIRED') return res.status(410).json({ error: 'Document expired' });
        if (status === 'PRINT_LIMIT_REACHED') return res.status(410).json({ error: 'Print limit reached' });
        if (new Date() > new Date(metadata.expiresAt)) return res.status(410).json({ error: 'Document expired' });

        const files = metadata.files || (metadata.gcsFileName ? [{ fileName: metadata.fileName, mimeType: metadata.mimeType, gcsFileName: metadata.gcsFileName }] : []);
        const printLimit = metadata.printLimit ?? null;
        const printCount = metadata.printCount ?? metadata.usedPrints ?? 0;
        const viewLimit = metadata.viewLimit ?? null;
        const viewCount = metadata.viewCount ?? 0;
        const accessMode = metadata.accessMode || 'PRINT'; // default to PRINT if missing

        res.json({
            success: true,
            files: files.map(f => ({
                fileName: f.fileName,
                mimeType: f.mimeType,
                id: f.gcsFileName,
                downloadLimit: f.downloadLimit ?? null,
                downloadCount: f.downloadCount ?? 0,
                downloadsRemaining: f.downloadLimit === null ? null : Math.max(0, f.downloadLimit - (f.downloadCount || 0))
            })),
            printLimit,
            printCount,
            printsRemaining: printLimit === null ? null : Math.max(0, printLimit - printCount),
            viewLimit,
            viewCount,
            viewsRemaining: viewLimit === null ? null : Math.max(0, viewLimit - viewCount),
            accessMode
        });
    } catch (error) {
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Rate limit for print endpoint (prevent abuse / duplicate retries)
const printRateLimit = new Map();
const PRINT_RATE_WINDOW = 10 * 1000; // 10 seconds per code
const PRINT_RATE_MAX = 5; // Max 5 print attempts per code per window
const printRateMiddleware = (req, res, next) => {
    const { code } = req.params;
    const key = `${req.ip || 'localhost'}:${code}`;
    const now = Date.now();
    if (!printRateLimit.has(key)) {
        printRateLimit.set(key, { count: 1, resetAt: now + PRINT_RATE_WINDOW });
        return next();
    }
    const lim = printRateLimit.get(key);
    if (now > lim.resetAt) {
        printRateLimit.set(key, { count: 1, resetAt: now + PRINT_RATE_WINDOW });
        return next();
    }
    if (lim.count >= PRINT_RATE_MAX) {
        return res.status(429).json({ error: 'Too many print attempts. Please wait.' });
    }
    lim.count++;
    next();
};

app.post('/api/document/printed/:code', printRateMiddleware, async (req, res) => {
    const { code } = req.params;

    try {
        const metadata = await getMetadata(code);
        if (metadata && metadata.accessMode === 'VIEW') {
            return res.status(403).json({ error: 'Printing is disabled in View-Only mode' });
        }
    } catch (err) {
        // Let incrementPrintCount handle the actual document retrieval errors
    }

    // 🔍 DEBUG: Log API call details
    console.log("📡 PRINT API CALLED:", { code, timestamp: new Date().toISOString() });

    try {
        console.log(`🚀 PRINT API HIT for code: ${req.params.code}`);
        const result = await incrementPrintCount(req.params.code);

        // 🔍 DEBUG: Log result details
        console.log("📊 PRINT API RESULT:", result);

        if (!result.success) {
            const status = result.error === 'Document not found' ? 404 :
                result.error === 'Document expired' || result.error === 'Print limit reached' ? 410 : 400;
            return res.status(status).json({ error: result.error });
        }
        console.log(`[PRINT] Code ${code} printed. Count ${result.printCount}/${result.printLimit ?? '∞'}`);
        res.json({
            success: true,
            printCount: result.printCount,
            printLimit: result.printLimit,
            printsRemaining: result.printLimit === null ? null : Math.max(0, result.printLimit - result.printCount),
            status: result.status
        });

        // Trigger immediate deletion if limit reached
        if (result.status === 'EXPIRED' || result.status === 'PRINT_LIMIT_REACHED') {
            runCleanup().catch(err => console.error('[Print] Cleanup error:', err));
        }
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Rate limit for viewed endpoint
const viewRateLimit = new Map();
const VIEW_RATE_WINDOW = 5 * 1000; // 5 seconds per code
const VIEW_RATE_MAX = 10;
const viewRateMiddleware = (req, res, next) => {
    const { code } = req.params;
    const key = `${req.ip || 'localhost'}:${code}`;
    const now = Date.now();
    if (!viewRateLimit.has(key)) {
        viewRateLimit.set(key, { count: 1, resetAt: now + VIEW_RATE_WINDOW });
        return next();
    }
    const lim = viewRateLimit.get(key);
    if (now > lim.resetAt) {
        viewRateLimit.set(key, { count: 1, resetAt: now + VIEW_RATE_WINDOW });
        return next();
    }
    if (lim.count >= VIEW_RATE_MAX) {
        return res.status(429).json({ error: 'Too many view attempts. Please wait.' });
    }
    lim.count++;
    next();
};

app.post('/api/document/viewed/:code', viewRateMiddleware, async (req, res) => {
    const { code } = req.params;

    try {
        const metadata = await getMetadata(code);
        if (!metadata) return res.status(404).json({ error: 'Document not found' });
        if (metadata.accessMode !== 'VIEW') {
            return res.status(400).json({ error: 'Not in View-Only mode' });
        }

        const result = await incrementViewCount(code);

        if (!result.success) {
            const status = result.error === 'Document not found' ? 404 :
                result.error === 'Document expired' || result.error === 'View limit reached' ? 410 : 400;
            return res.status(status).json({ error: result.error });
        }

        res.json({
            success: true,
            viewCount: result.viewCount,
            viewLimit: result.viewLimit,
            viewsRemaining: result.viewLimit === null ? null : Math.max(0, result.viewLimit - result.viewCount),
            status: result.status
        });

        if (result.status === 'EXPIRED') {
            runCleanup().catch(err => console.error('[View] Cleanup error:', err));
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to record view' });
    }
});

app.post('/api/document/expire/:code', async (req, res) => {
    const { code } = req.params;
    try {
        const metadata = await getMetadata(code);
        if (!metadata) return res.status(404).json({ error: 'Document not found' });
        metadata.expiresAt = new Date(Date.now() - 1000);
        metadata.status = 'EXPIRED';
        await saveMetadata(metadata);

        // Immediate cleanup
        runCleanup().catch(err => console.error('[Expire] Cleanup error:', err));

        res.json({ success: true, message: 'Document expired successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to expire document' });
    }
});

// Extend expiry endpoint - support both PATCH and POST for compatibility
app.patch('/api/document/extend/:code', checkRateLimit, async (req, res) => {
    const { code } = req.params;
    const { extensionMinutes } = req.body;

    console.log(`[EXTEND] Request received for code: ${code}, extensionMinutes: ${extensionMinutes}, type: ${typeof extensionMinutes}`);

    try {
        // Validate input
        if (extensionMinutes === undefined || extensionMinutes === null) {
            return res.status(400).json({ error: 'extensionMinutes is required' });
        }

        const extensionNum = typeof extensionMinutes === 'string' ? parseInt(extensionMinutes, 10) : extensionMinutes;

        if (isNaN(extensionNum) || typeof extensionNum !== 'number') {
            return res.status(400).json({ error: 'extensionMinutes must be a number' });
        }

        if (extensionNum <= 0) {
            return res.status(400).json({ error: 'extensionMinutes must be positive' });
        }

        if (extensionNum > 120) {
            return res.status(400).json({ error: 'extensionMinutes cannot exceed 120 minutes' });
        }

        // Attempt to extend expiry
        const result = await extendExpiry(code, extensionNum);

        if (!result.success) {
            const statusCode = result.error === 'Document not found' ? 404 :
                result.error.includes('expired') ? 410 :
                    result.error.includes('not active') ? 409 : 400;
            console.error(`Extend expiry failed for code ${code}:`, result.error);
            return res.status(statusCode).json({ error: result.error });
        }

        // Ensure newExpiresAt is a Date object
        const newExpiresAt = result.newExpiresAt instanceof Date
            ? result.newExpiresAt
            : new Date(result.newExpiresAt);

        // Log extension event
        console.log(`Code ${code} extended by ${extensionNum} minutes at ${new Date().toISOString()}. New expiry: ${newExpiresAt.toISOString()}`);

        res.json({
            success: true,
            expiresAt: newExpiresAt.toISOString(),
            message: `Expiry extended by ${extensionNum} minutes`
        });
    } catch (error) {
        console.error('Error extending expiry:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: error.message || 'Failed to extend expiry' });
    }
});

// Also support POST for extend (for compatibility)
app.post('/api/document/extend/:code', checkRateLimit, async (req, res) => {
    const { code } = req.params;
    const { extensionMinutes } = req.body;

    console.log(`[EXTEND POST] Request received for code: ${code}, extensionMinutes: ${extensionMinutes}, type: ${typeof extensionMinutes}`);

    try {
        // Validate input
        if (extensionMinutes === undefined || extensionMinutes === null) {
            return res.status(400).json({ error: 'extensionMinutes is required' });
        }

        const extensionNum = typeof extensionMinutes === 'string' ? parseInt(extensionMinutes, 10) : extensionMinutes;

        if (isNaN(extensionNum) || typeof extensionNum !== 'number') {
            return res.status(400).json({ error: 'extensionMinutes must be a number' });
        }

        if (extensionNum <= 0) {
            return res.status(400).json({ error: 'extensionMinutes must be positive' });
        }

        if (extensionNum > 120) {
            return res.status(400).json({ error: 'extensionMinutes cannot exceed 120 minutes' });
        }

        // Attempt to extend expiry
        const result = await extendExpiry(code, extensionNum);

        if (!result.success) {
            const statusCode = result.error === 'Document not found' ? 404 :
                result.error.includes('expired') ? 410 :
                    result.error.includes('not active') ? 409 : 400;
            console.error(`Extend expiry failed for code ${code}:`, result.error);
            return res.status(statusCode).json({ error: result.error });
        }

        // Ensure newExpiresAt is a Date object
        const newExpiresAt = result.newExpiresAt instanceof Date
            ? result.newExpiresAt
            : new Date(result.newExpiresAt);

        // Log extension event
        console.log(`Code ${code} extended by ${extensionNum} minutes at ${new Date().toISOString()}. New expiry: ${newExpiresAt.toISOString()}`);

        res.json({
            success: true,
            expiresAt: newExpiresAt.toISOString(),
            message: `Expiry extended by ${extensionNum} minutes`
        });
    } catch (error) {
        console.error('Error extending expiry:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: error.message || 'Failed to extend expiry' });
    }
});

// Backward compatibility redirect
app.get('/api/document/:code/:fileId', cspMiddleware, (req, res) => {
    res.redirect(`/api/stream/${req.params.code}/${req.params.fileId}?download=${req.query.download || 'false'}`);
});

// Dedicated Streaming Endpoint
app.get('/api/stream/:code/:fileId', cspMiddleware, async (req, res) => {
    const { code, fileId } = req.params;
    try {
        const metadata = await getMetadata(code);
        if (!metadata) return res.status(404).json({ error: 'Document not found' });
        const status = metadata.status || 'active';
        if (status === 'EXPIRED') return res.status(410).json({ error: 'Document expired' });
        if (status === 'PRINT_LIMIT_REACHED') return res.status(410).json({ error: 'Print limit reached' });
        if (new Date() > new Date(metadata.expiresAt)) return res.status(410).json({ error: 'Document expired' });

        const files = metadata.files || (metadata.gcsFileName ? [{ fileName: metadata.fileName, mimeType: metadata.mimeType, gcsFileName: metadata.gcsFileName }] : []);
        const file = files.find(f => f.gcsFileName === fileId);
        if (!file) return res.status(404).json({ error: 'File not found in batch' });

        const accessMode = metadata.accessMode || 'PRINT';
        const isDownload = req.query.download === 'true';

        if (isDownload && accessMode === 'PRINT') {
            return res.status(403).json({ error: 'Download not allowed in Secure Print mode' });
        }
        if (isDownload && accessMode === 'VIEW') {
            return res.status(403).json({ error: 'Download not allowed in View-Only mode' });
        }

        if (isDownload && accessMode === 'SHARE') {
            const incrementResult = await incrementDownloadCount(code, fileId);
            if (!incrementResult.success) {
                return res.status(403).json({ error: incrementResult.error || 'Download limit reached for this file' });
            }
            if (incrementResult.status === 'EXPIRED') {
                runCleanup().catch(err => console.error('[Download] Cleanup error:', err));
            }
        }

        const contentType = getMimeType(file.fileName, file.mimeType);
        res.setHeader('Content-Type', contentType);
        if (isDownload) {
            res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
        } else {
            res.setHeader('Content-Disposition', 'inline');
        }
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const stream = downloadStream(file.gcsFileName);

        // Handle stream errors
        stream.on('error', (err) => {
            console.error('[STREAM] Error streaming file:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to stream file properly' });
            }
        });

        stream.pipe(res);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start cleanup scheduler
startScheduler();

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
