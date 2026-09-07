import React, { useState, useRef } from 'react';
import { Search, Loader2, FileText, AlertCircle, Printer, Info, Download, Shield, Layers } from 'lucide-react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { API_BASE } from '../config';
import PDFViewer from '../components/PDFViewer';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const Access = () => {
    const [code, setCode] = useState('');
    const [verified, setVerified] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileUrl, setFileUrl] = useState(null);
    const [isBlurred, setIsBlurred] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [printStatus, setPrintStatus] = useState('');
    const [timestamp, setTimestamp] = useState('');
    const [securityAlert, setSecurityAlert] = useState(null);
    const [printsRemaining, setPrintsRemaining] = useState(null);
    const [printLimitReached, setPrintLimitReached] = useState(false);
    const [viewsRemaining, setViewsRemaining] = useState(null);
    const [viewLimitReached, setViewLimitReached] = useState(false);
    const [accessMode, setAccessMode] = useState('PRINT');
    const iframeRef = useRef(null);
    const printIframeRef = useRef(null);
    const isPrintingRef = useRef(false); // Execution lock to prevent multiple prints
    const activePrintIframeRef = useRef(null); // Track active print iframe for cleanup

    const showSecurityAlert = (msg) => {
        setSecurityAlert(msg);
        setTimeout(() => setSecurityAlert(null), 3000);
    };

    // Prevent Interactions & Shortcuts
    React.useEffect(() => {
        const handleKeyDown = (e) => {
            const isCmdOrCtrl = e.ctrlKey || e.metaKey;

            // Block Save, View Source, Inspect, Print (outside button), Select All
            if (
                (isCmdOrCtrl && ['s', 'u', 'i', 'j', 'c', 'a', 'p'].includes(e.key.toLowerCase())) ||
                (e.key === 'F12') ||
                (isCmdOrCtrl && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) ||
                (isCmdOrCtrl && e.altKey && e.key.toLowerCase() === 'u')
            ) {
                e.preventDefault();
                showSecurityAlert('Security Policy: Action restricted.');
                return false;
            }
        };

        const handleContextMenu = (e) => {
            e.preventDefault();
            showSecurityAlert('Right-click is disabled for security reasons.');
            return false;
        };

        const handleBlur = () => {
            if (!isPrinting) setIsBlurred(true);
        };
        const handleFocus = () => setIsBlurred(false);

        // Print event handlers - hide watermark during print
        const handleBeforePrint = () => {
            setIsPrinting(true);
            // Add print class to body to trigger CSS
            document.body.classList.add('printing');
        };

        const handleAfterPrint = () => {
            setIsPrinting(false);
            document.body.classList.remove('printing');
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('beforeprint', handleBeforePrint);
        window.addEventListener('afterprint', handleAfterPrint);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('beforeprint', handleBeforePrint);
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, [isPrinting]);

    const handleSearch = async () => {
        if (code.length !== 6) {
            setError('Please enter 6-digit code');
            return;
        }

        setLoading(true);
        setError(null);
        setVerified(false);
        setPrintLimitReached(false);

        try {
            const verifyRes = await axios.get(`${API_BASE}/api/document/verify/${code}`);
            if (verifyRes.data.success) {
                const fetchedFiles = verifyRes.data.files;
                setFiles(fetchedFiles);
                setVerified(true);
                setTimestamp(new Date().toLocaleString());
                setPrintsRemaining(verifyRes.data.printsRemaining);
                setPrintLimitReached(false);
                setViewsRemaining(verifyRes.data.viewsRemaining);
                setViewLimitReached(false);
                setAccessMode(verifyRes.data.accessMode || 'PRINT');

                // Auto-select first file for instant preview
                if (fetchedFiles.length > 0) {
                    loadFile(fetchedFiles[0]);
                }
            }
        } catch (err) {
            console.error('Access denied', err);
            const errMsg = err.response?.data?.error || 'Verification failed.';
            setError(errMsg);
            if (errMsg === 'Print limit reached') setPrintLimitReached(true);
            if (errMsg === 'View limit reached') setViewLimitReached(true);
        } finally {
            setLoading(false);
        }
    };

    const isImageFile = (file) => {
        if (!file) return false;
        const mime = file.mimeType || '';
        const name = file.fileName || '';
        return mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif)$/i.test(name);
    };

    const isOfficeFile = (fileName) => {
        return /\.(doc|docx|xls|xlsx|ppt|pptx)$/i.test(fileName || '');
    };

    const loadFile = async (file) => {
        setLoading(true);
        try {
            if (fileUrl && fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl);

            let baseUrl = API_BASE;
            if (baseUrl.startsWith('/')) {
                baseUrl = window.location.origin + baseUrl;
            } else if (!baseUrl.startsWith('http')) {
                baseUrl = window.location.origin;
            }

            const streamUrl = `${baseUrl}/api/stream/${code}/${file.id}`;
            setSelectedFile(file);

            // Fetch image as blob URL to ensure flawless cross-origin rendering and zero broken image icons
            if (isImageFile(file)) {
                try {
                    const response = await axios.get(streamUrl, { responseType: 'blob' });
                    const blobUrl = URL.createObjectURL(response.data);
                    setFileUrl(blobUrl);
                } catch (imgErr) {
                    console.warn('Direct blob fetch failed, falling back to streamUrl:', imgErr);
                    setFileUrl(streamUrl);
                }
            } else {
                setFileUrl(streamUrl);
            }

            // Record view if in VIEW mode and page was not just refreshed to show same file
            if (accessMode === 'VIEW' && file) {
                const sessionKey = `viewed_${code}_${file.id}`;
                if (!sessionStorage.getItem(sessionKey)) {
                    try {
                        const viewRes = await axios.post(`${API_BASE}/api/document/viewed/${code}`);
                        if (viewRes.data.success) {
                            setViewsRemaining(viewRes.data.viewsRemaining);
                            sessionStorage.setItem(sessionKey, 'true'); // Only count once per session
                            if (viewRes.data.status === 'EXPIRED' || viewRes.data.status === 'VIEW_LIMIT_REACHED') {
                                setViewLimitReached(true);
                            }
                        }
                    } catch (err) {
                        console.error('Failed to increment view count', err);
                        if (err.response?.status === 410) {
                            setViewLimitReached(true);
                            setError(err.response?.data?.error || 'View limit reached. Document has been expired.');
                            setVerified(false);
                        }
                    }
                }
            }

        } catch (err) {
            setError('Failed to load file.');
        } finally {
            setLoading(false);
        }
    };

    const blobToDataUrl = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const renderFileToImages = async (file, currentCode, baseUrl) => {
        const streamUrl = `${baseUrl}/api/stream/${currentCode}/${file.id}`;

        if (isImageFile(file)) {
            try {
                const res = await axios.get(streamUrl, { responseType: 'blob' });
                const dataUrl = await blobToDataUrl(res.data);
                return [dataUrl];
            } catch (e) {
                console.error('Failed to load image for batch print:', file.fileName, e);
                return [streamUrl];
            }
        }

        // PDF rendering to canvas pages (crisp high-DPI 2.0 scale)
        try {
            const loadingTask = pdfjsLib.getDocument({
                url: streamUrl,
                cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.530/cmaps/',
                cMapPacked: true,
            });
            const pdfDoc = await loadingTask.promise;
            const numPages = pdfDoc.numPages;
            const pageImages = [];

            for (let p = 1; p <= numPages; p++) {
                const page = await pdfDoc.getPage(p);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const context = canvas.getContext('2d');
                await page.render({ canvasContext: context, viewport }).promise;
                pageImages.push(canvas.toDataURL('image/png'));
            }
            return pageImages;
        } catch (pdfErr) {
            console.error('Failed to render PDF to images for batch print:', file.fileName, pdfErr);
            return [streamUrl];
        }
    };

    const handleSecurePrint = async (printAll = true) => {
        if (isPrintingRef.current || printsRemaining === 0) {
            return;
        }

        const filesToPrint = (printAll && files && files.length > 0) ? files : (selectedFile ? [selectedFile] : []);
        if (filesToPrint.length === 0) return;

        isPrintingRef.current = true;
        setIsPrinting(true);
        setPrintStatus(`Preparing ${filesToPrint.length} file(s)...`);

        try {
            // Reserve print slot first
            let printedRes;
            try {
                printedRes = await axios.post(`${API_BASE}/api/document/printed/${code}`);
                if (printedRes?.data?.success) {
                    setPrintsRemaining(printedRes.data.printsRemaining);
                }
            } catch (e) {
                console.error("Print count error:", e.response?.data || e);
                const errMsg = e.response?.data?.error || '';
                const isLimit = errMsg.toLowerCase().includes('limit');
                const isExpired = errMsg.toLowerCase().includes('expired') || e.response?.status === 410 || e.response?.status === 404;

                if (isLimit) {
                    setPrintLimitReached(true);
                    setPrintsRemaining(0);
                    setError('Print limit reached');
                    showSecurityAlert('Print limit reached');
                    return;
                } else if (isExpired) {
                    setError('File expired');
                    showSecurityAlert('File expired');
                    setVerified(false);
                    return;
                } else {
                    setError(errMsg || 'File expired');
                    showSecurityAlert(errMsg || 'File expired');
                    setVerified(false);
                    return;
                }
            }

            let baseUrl = API_BASE;
            if (baseUrl.startsWith('/')) {
                baseUrl = window.location.origin + baseUrl;
            } else if (!baseUrl.startsWith('http')) {
                baseUrl = window.location.origin;
            }

            const allPages = [];
            for (let i = 0; i < filesToPrint.length; i++) {
                setPrintStatus(`Processing file ${i + 1} of ${filesToPrint.length}: ${filesToPrint[i].fileName || ''}...`);
                const pages = await renderFileToImages(filesToPrint[i], code, baseUrl);
                allPages.push(...pages);
            }

            setPrintStatus('Opening print dialog...');

            const printIframe = document.createElement('iframe');
            printIframe.style.position = 'fixed';
            printIframe.style.right = '0';
            printIframe.style.bottom = '0';
            printIframe.style.width = '0px';
            printIframe.style.height = '0px';
            printIframe.style.border = 'none';
            document.body.appendChild(printIframe);

            const iframeDoc = printIframe.contentDocument || printIframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Privy Print - Batch Print (${allPages.length} Pages)</title>
                    <style>
                        @page {
                            size: auto;
                            margin: 0;
                        }
                        html, body {
                            margin: 0;
                            padding: 0;
                            background: #ffffff;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        .print-page-wrapper {
                            width: 100vw;
                            height: 100vh;
                            page-break-after: always;
                            break-after: page;
                            page-break-inside: avoid;
                            break-inside: avoid;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            box-sizing: border-box;
                            padding: 8mm;
                        }
                        .print-page-wrapper:last-child {
                            page-break-after: avoid;
                            break-after: avoid;
                        }
                        .print-page-wrapper img {
                            max-width: 100%;
                            max-height: 100%;
                            width: auto;
                            height: auto;
                            object-fit: contain;
                            display: block;
                            margin: auto;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                    </style>
                </head>
                <body>
                    ${allPages.map((dataUrl, idx) => `
                        <div class="print-page-wrapper">
                            <img src="${dataUrl}" alt="Page ${idx + 1}" />
                        </div>
                    `).join('')}
                </body>
                </html>
            `);
            iframeDoc.close();

            const images = Array.from(iframeDoc.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
            }));

            await new Promise(r => setTimeout(r, 300));

            try {
                printIframe.contentWindow.focus();
                printIframe.contentWindow.print();
            } catch (printErr) {
                console.warn('Batch iframe print error, falling back to window.print():', printErr);
                window.print();
            }

            setTimeout(() => {
                try {
                    if (document.body.contains(printIframe)) {
                        document.body.removeChild(printIframe);
                    }
                } catch (cleanErr) {}
            }, 3000);

            if (printedRes?.data?.status === 'EXPIRED' || printedRes?.data?.status === 'PRINT_LIMIT_REACHED' || printedRes?.data?.printsRemaining === 0) {
                setPrintsRemaining(0);
                setPrintLimitReached(true);
            }
        } catch (err) {
            console.error('Batch secure print error:', err);
            showSecurityAlert('Unable to initiate batch print dialog.');
        } finally {
            setTimeout(() => {
                isPrintingRef.current = false;
                setIsPrinting(false);
                setPrintStatus('');
            }, 1000);
        }
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '2rem auto', position: 'relative' }}>
            {securityAlert && (
                <div className="animate-fade-in" style={{
                    position: 'fixed',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(157, 78, 221, 0.9)', /* Purple metallic alert */
                    color: 'white',
                    padding: '1rem 2rem',
                    borderRadius: '50px',
                    zIndex: 9999,
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 0 20px rgba(157, 78, 221, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: 'bold'
                }}>
                    <AlertCircle size={20} />
                    {securityAlert}
                </div>
            )}
            <div className="glass-panel no-print" style={{ padding: '2rem', transition: 'filter 0.3s ease', filter: isBlurred ? 'blur(25px)' : 'none' }}>
                <div className="no-print" style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 className="glow-text no-print" style={{ color: 'var(--primary)' }}>Secure Batch Portal</h2>
                    <p className="no-print" style={{ color: 'var(--text-secondary)' }}>View and Print Secured Batch Files</p>
                </div>

                {!verified ? (
                    <div style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', justifyContent: 'center' }}>
                            <div style={{ position: 'relative', width: '300px' }}>
                                <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={20} />
                                <input
                                    type="text"
                                    placeholder="Enter 6-digit code"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    style={{ paddingLeft: '3rem', fontSize: '1.2rem', textAlign: 'center', letterSpacing: '4px', background: 'rgba(255, 255, 255, 0.6)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                />
                            </div>
                            <button className="neon-border" onClick={handleSearch} disabled={code.length !== 6 || loading}>
                                {loading ? <Loader2 className="spinner" /> : 'VERIFY CODE'}
                            </button>
                        </div>
                        {error && <p style={{ color: '#ff4d4d', textAlign: 'center' }}>{error}</p>}
                    </div>
                ) : (
                    <div className="no-print" style={{ display: 'grid', gridTemplateColumns: files.length > 1 ? '300px 1fr' : '1fr', gap: '2rem' }}>
                        {files.length > 1 && accessMode === 'PRINT' && (
                            <div className="no-print" style={{ borderRight: '1px solid var(--glass-border)', paddingRight: '1.5rem' }}>
                                <h3 className="no-print" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>FILES IN BATCH</h3>
                                <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {files.map((f, i) => (
                                        <button
                                            key={i}
                                            className="no-print"
                                            onClick={() => loadFile(f)}
                                            style={{
                                                textAlign: 'left',
                                                padding: '1rem',
                                                background: selectedFile?.id === f.id ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.4)',
                                                border: selectedFile?.id === f.id ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                fontSize: '0.8rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                color: 'var(--text-primary)'
                                            }}
                                        >
                                            <FileText size={16} color={selectedFile?.id === f.id ? 'var(--primary)' : 'var(--text-secondary)'} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fileName}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            {accessMode === 'SHARE' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                                        <Shield size={48} color="var(--primary)" style={{ margin: '0 auto 1rem', filter: 'drop-shadow(0 0 10px rgba(157,78,221,0.5))' }} />
                                        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>Secure Code Verified</h3>
                                        <p style={{ color: 'var(--text-secondary)' }}>This batch is securely protected. Download individual files below.</p>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
                                        {files.map((file, idx) => (
                                            <div key={idx} style={{ flex: '1 1 300px', maxWidth: '400px', padding: '1.5rem', background: 'rgba(255, 255, 255, 0.6)', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
                                                    <FileText size={32} color="var(--primary)" />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <h4 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.fileName}>{file.fileName}</h4>
                                                        {file.downloadsRemaining !== null && (
                                                            <span style={{ fontSize: '0.85rem', color: file.downloadsRemaining === 0 ? '#ff4d4d' : 'var(--primary)', fontWeight: 'bold' }}>
                                                                {file.downloadsRemaining === 0 ? 'Download Limit Reached' : `${file.downloadsRemaining} Download(s) Remaining`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div style={{ marginTop: 'auto' }}>
                                                    {file.downloadsRemaining !== 0 ? (
                                                        <a
                                                            href={`${API_BASE}/api/stream/${code}/${file.id}?download=true`}
                                                            download
                                                            onClick={() => {
                                                                if (file.downloadsRemaining !== null) {
                                                                    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, downloadsRemaining: Math.max(0, f.downloadsRemaining - 1) } : f));
                                                                }
                                                            }}
                                                            className="neon-border"
                                                            style={{
                                                                background: 'linear-gradient(180deg, var(--primary) 0%, var(--primary-hover) 100%)',
                                                                color: 'white',
                                                                padding: '0.75rem 1.5rem',
                                                                cursor: 'pointer',
                                                                textDecoration: 'none',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '0.5rem',
                                                                fontWeight: 'bold',
                                                                borderRadius: '8px',
                                                                width: '100%',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                        >
                                                            <Download size={18} /> DOWNLOAD
                                                        </a>
                                                    ) : (
                                                        <div style={{
                                                            padding: '0.75rem 1.5rem',
                                                            background: 'rgba(255,77,77,0.1)',
                                                            color: '#ff4d4d',
                                                            border: '1px solid #ff4d4d',
                                                            borderRadius: '8px',
                                                            fontWeight: 'bold',
                                                            textAlign: 'center',
                                                            width: '100%'
                                                        }}>
                                                            Access Expired
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : selectedFile ? (
                                <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <span style={{ fontWeight: 'bold' }}>{selectedFile.fileName}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            {accessMode === 'PRINT' && printsRemaining !== null && (
                                                <span style={{
                                                    fontSize: '0.85rem',
                                                    color: printsRemaining === 0 ? '#ff4d4d' : 'var(--primary)',
                                                    fontWeight: '600'
                                                }}>
                                                    {printsRemaining === 0 ? 'Print Limit Reached' : `Prints Remaining: ${printsRemaining}`}
                                                </span>
                                            )}
                                            {accessMode === 'VIEW' && viewsRemaining !== null && (
                                                <span style={{
                                                    fontSize: '0.85rem',
                                                    color: viewsRemaining === 0 ? '#ff4d4d' : 'var(--neon-pink)',
                                                    fontWeight: '600'
                                                }}>
                                                    {viewsRemaining === 0 ? 'View Limit Reached' : `Views Remaining: ${viewsRemaining}`}
                                                </span>
                                            )}
                                            {accessMode === 'VIEW' ? (
                                                <div style={{
                                                    background: 'rgba(255, 0, 255, 0.1)',
                                                    color: 'var(--neon-pink)',
                                                    border: '1px solid var(--neon-pink)',
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '8px',
                                                    fontWeight: 'bold',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem'
                                                }}>
                                                    <Shield size={16} /> VIEW ONLY
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                                    <button
                                                        className="neon-border no-print"
                                                        onClick={() => handleSecurePrint(true)}
                                                        disabled={isPrinting || isPrintingRef.current || printsRemaining === 0}
                                                        style={{
                                                            padding: '0.6rem 1.4rem',
                                                            cursor: isPrinting ? 'not-allowed' : 'pointer',
                                                            opacity: isPrinting ? 0.7 : 1,
                                                            border: 'none',
                                                            borderRadius: '8px',
                                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                            color: 'white',
                                                            fontWeight: 'bold',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.5rem',
                                                            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.25)'
                                                        }}
                                                    >
                                                        {isPrinting ? <Loader2 size={18} className="spinner" /> : <Printer size={18} />}
                                                        {isPrinting ? (printStatus || 'PRINTING...') : (files.length > 1 ? `SECURE PRINT ALL (${files.length} FILES)` : 'SECURE PRINT')}
                                                    </button>
                                                    {files.length > 1 && (
                                                        <button
                                                            className="no-print"
                                                            onClick={() => handleSecurePrint(false)}
                                                            disabled={isPrinting || isPrintingRef.current || printsRemaining === 0}
                                                            style={{
                                                                padding: '0.6rem 1rem',
                                                                cursor: isPrinting ? 'not-allowed' : 'pointer',
                                                                opacity: isPrinting ? 0.7 : 1,
                                                                border: '1px solid var(--border-color)',
                                                                borderRadius: '8px',
                                                                background: 'rgba(255, 255, 255, 0.6)',
                                                                color: 'var(--text-primary)',
                                                                fontSize: '0.85rem',
                                                                fontWeight: '600',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.4rem'
                                                            }}
                                                            title="Print only the currently selected file"
                                                        >
                                                            <Printer size={14} /> Print Current Only
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div
                                        className="print-viewer-container"
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            showSecurityAlert('Right-click is disabled for security reasons.');
                                            return false;
                                        }}
                                        style={{
                                            height: '75vh',
                                            minHeight: '600px',
                                            maxHeight: '850px',
                                            background: 'rgba(255,255,255,0.8)',
                                            borderRadius: '12px',
                                            overflow: isImageFile(selectedFile) ? 'auto' : 'hidden',
                                            touchAction: 'auto',
                                            position: 'relative',
                                            border: '1px solid var(--border-color)',
                                            boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.05)'
                                        }}
                                    >
                                        {/* Security Shield over the selected file to block right-clicks */}
                                        <div
                                            className="no-print"
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                showSecurityAlert('Right-click is disabled for security reasons.');
                                                return false;
                                            }}
                                            onDragStart={(e) => e.preventDefault()}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: '100%',
                                                zIndex: 15,
                                                background: 'transparent',
                                                userSelect: 'none',
                                                WebkitUserSelect: 'none',
                                                pointerEvents: 'none'
                                            }}
                                        />

                                        {isImageFile(selectedFile) ? (
                                            <div style={{
                                                width: '100%',
                                                height: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '1.5rem',
                                                boxSizing: 'border-box',
                                                overflow: 'auto'
                                            }}>
                                                <img
                                                    className="print-image"
                                                    id="print-image-element"
                                                    src={fileUrl}
                                                    style={{
                                                        maxWidth: '100%',
                                                        maxHeight: '100%',
                                                        objectFit: 'contain',
                                                        borderRadius: '8px',
                                                        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
                                                        display: 'block',
                                                        pointerEvents: 'auto',
                                                        userSelect: 'none',
                                                        WebkitUserSelect: 'none'
                                                    }}
                                                    alt="Secure View"
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        showSecurityAlert('Right-click is disabled for security reasons.');
                                                        return false;
                                                    }}
                                                    onDragStart={(e) => e.preventDefault()}
                                                    onLoad={() => {
                                                        console.log('Image loaded securely');
                                                    }}
                                                />
                                            </div>
                                        ) : isOfficeFile(selectedFile?.fileName) ? (
                                            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                                {fileUrl && (fileUrl.includes('localhost') || fileUrl.includes('127.0.0.1')) ? (
                                                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>
                                                        <AlertCircle size={48} color="#ff4d4d" style={{ marginBottom: '1rem' }} />
                                                        <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Local Network Detected</h3>
                                                        <p>Microsoft Office Online Viewer requires a publicly accessible URL to generate a preview. It cannot read files directly from <code>localhost</code>.</p>
                                                        {accessMode === 'SHARE' ? (
                                                            <p style={{ marginTop: '1rem', color: 'var(--primary)' }}>Please use the Download button above to view this file.</p>
                                                        ) : (
                                                            <p style={{ marginTop: '1rem', color: '#ff4d4d' }}>Secure Print unavailable for Office files on Localhost.</p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <iframe
                                                        src={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`}
                                                        style={{ width: "100%", height: "100%", border: "none" }}
                                                        title="Office Viewer"
                                                    />
                                                )}
                                            </div>
                                        ) : (
                                            <PDFViewer fileUrl={fileUrl} showSecurityAlert={showSecurityAlert} />
                                        )}
                                        {/* Active Security Overlay - View Only (Hidden in Print) */}
                                        <div
                                            className="view-watermark"
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: '100%',
                                                pointerEvents: 'none', // Allow scroll events to pass through
                                                background: 'repeating-linear-gradient(45deg, transparent, transparent 100px, rgba(0,0,0,0.02) 100px, rgba(0,0,0,0.02) 101px)',
                                                zIndex: 10
                                            }}
                                        />

                                        {/* PRIVY PRINT Watermark with Code - Anti-Capture Protection */}
                                        <div
                                            className="view-watermark"
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: '100%',
                                                pointerEvents: 'none', // Don't block interactions, just overlay
                                                zIndex: 11,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                userSelect: 'none',
                                                WebkitUserSelect: 'none',
                                                MozUserSelect: 'none',
                                                msUserSelect: 'none'
                                            }}
                                        >
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: '50%',
                                                    left: '50%',
                                                    transform: 'translate(-50%, -50%) rotate(-45deg)',
                                                    fontSize: 'clamp(24px, 4vw, 48px)',
                                                    fontWeight: 'bold',
                                                    color: 'rgba(157, 78, 221, 0.1)',
                                                    whiteSpace: 'nowrap',
                                                    textShadow: '0 0 10px rgba(157, 78, 221, 0.2)',
                                                    letterSpacing: '4px',
                                                    fontFamily: 'monospace',
                                                    pointerEvents: 'none',
                                                    zIndex: 12
                                                }}
                                            >
                                                PRIVY PRINT - {code}
                                            </div>

                                            {/* Multiple watermark layers for better coverage */}
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: '20%',
                                                    left: '10%',
                                                    transform: 'rotate(-45deg)',
                                                    fontSize: 'clamp(18px, 3vw, 36px)',
                                                    fontWeight: 'bold',
                                                    color: 'rgba(157, 78, 221, 0.08)',
                                                    whiteSpace: 'nowrap',
                                                    letterSpacing: '3px',
                                                    fontFamily: 'monospace',
                                                    pointerEvents: 'none',
                                                    zIndex: 12
                                                }}
                                            >
                                                PRIVY PRINT
                                            </div>

                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    bottom: '20%',
                                                    right: '10%',
                                                    transform: 'rotate(-45deg)',
                                                    fontSize: 'clamp(18px, 3vw, 36px)',
                                                    fontWeight: 'bold',
                                                    color: 'rgba(157, 78, 221, 0.08)',
                                                    whiteSpace: 'nowrap',
                                                    letterSpacing: '3px',
                                                    fontFamily: 'monospace',
                                                    pointerEvents: 'none',
                                                    zIndex: 12
                                                }}
                                            >
                                                CODE: {code}
                                            </div>

                                            {/* Corner watermarks */}
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: '10%',
                                                    left: '5%',
                                                    fontSize: 'clamp(14px, 2vw, 24px)',
                                                    fontWeight: 'bold',
                                                    color: 'rgba(0, 255, 0, 0.1)',
                                                    fontFamily: 'monospace',
                                                    pointerEvents: 'none',
                                                    zIndex: 12
                                                }}
                                            >
                                                {code}
                                            </div>

                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    bottom: '10%',
                                                    right: '5%',
                                                    fontSize: 'clamp(14px, 2vw, 24px)',
                                                    fontWeight: 'bold',
                                                    color: 'rgba(0, 255, 0, 0.1)',
                                                    fontFamily: 'monospace',
                                                    pointerEvents: 'none',
                                                    zIndex: 12
                                                }}
                                            >
                                                PRIVY PRINT
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="no-print" style={{ height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--glass-border)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                                    Select a file to preview securely
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Access;
