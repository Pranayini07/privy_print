import React, { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Loader2, FileText, Shield } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const PDFViewer = ({ fileUrl, showSecurityAlert }) => {
    const [renderedPages, setRenderedPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState(null);

    useEffect(() => {
        let isCancelled = false;
        let pdfDoc = null;

        const renderPdf = async () => {
            if (!fileUrl) return;
            setLoading(true);
            setError(null);
            setRenderedPages([]);
            setProgress({ current: 0, total: 0 });

            try {
                const loadingTask = pdfjsLib.getDocument({
                    url: fileUrl,
                    cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.530/cmaps/',
                    cMapPacked: true,
                });
                pdfDoc = await loadingTask.promise;

                if (isCancelled) return;

                const numPages = pdfDoc.numPages;
                setProgress({ current: 0, total: numPages });
                const pageImages = [];

                for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                    if (isCancelled) break;

                    const page = await pdfDoc.getPage(pageNum);
                    // Scale to 2.0 for sharp, high-DPI rendering of text and graphics
                    const viewport = page.getViewport({ scale: 2.0 });

                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const context = canvas.getContext('2d');

                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;

                    const dataUrl = canvas.toDataURL('image/png');
                    pageImages.push({
                        pageNum,
                        dataUrl,
                        width: viewport.width,
                        height: viewport.height,
                        aspectRatio: viewport.width / viewport.height
                    });

                    if (!isCancelled) {
                        setProgress({ current: pageNum, total: numPages });
                    }
                }

                if (!isCancelled) {
                    setRenderedPages(pageImages);
                    setLoading(false);
                }
            } catch (err) {
                console.error('Error rendering PDF:', err);
                if (!isCancelled) {
                    setError('Failed to render PDF document.');
                    setLoading(false);
                }
            }
        };

        renderPdf();

        return () => {
            isCancelled = true;
            if (pdfDoc) {
                pdfDoc.destroy().catch(() => {});
            }
        };
    }, [fileUrl]);

    const handleContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (showSecurityAlert) {
            showSecurityAlert('Right-click is disabled for security reasons.');
        }
        return false;
    };

    return (
        <div
            className="pdf-viewer-scroll-container"
            onContextMenu={handleContextMenu}
            style={{
                width: '100%',
                height: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '1.5rem 1rem 3rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2.5rem',
                boxSizing: 'border-box',
                userSelect: 'none',
                WebkitUserSelect: 'none'
            }}
        >
            {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '350px', gap: '1rem', color: 'var(--text-secondary)' }}>
                    <Loader2 className="spinner" size={36} color="var(--primary)" />
                    <span style={{ fontSize: '1rem', fontWeight: '500' }}>
                        {progress.total > 0
                            ? `Rendering Page ${progress.current} of ${progress.total}...`
                            : 'Loading Document...'}
                    </span>
                </div>
            )}

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ff4d4d', padding: '2rem' }}>
                    {error}
                </div>
            )}

            {!loading && !error && renderedPages.map((page) => (
                <div
                    key={page.pageNum}
                    className="pdf-page-card"
                    onContextMenu={handleContextMenu}
                    style={{
                        width: '100%',
                        maxWidth: '850px',
                        flexShrink: 0,
                        flexGrow: 0,
                        borderRadius: '8px',
                        background: '#ffffff',
                        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
                        overflow: 'hidden',
                        position: 'relative'
                    }}
                >
                    <div
                        className="no-print"
                        style={{
                            padding: '0.5rem 1rem',
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            color: '#475569',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                    >
                        <span>PAGE {page.pageNum} OF {renderedPages.length}</span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Shield size={12} /> Protected View
                        </span>
                    </div>

                    <img
                        src={page.dataUrl}
                        alt={`Page ${page.pageNum}`}
                        onContextMenu={handleContextMenu}
                        onPointerDown={(e) => {
                            if (e.button === 2) {
                                e.preventDefault();
                                handleContextMenu(e);
                            }
                        }}
                        onDragStart={(e) => e.preventDefault()}
                        style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            flexShrink: 0,
                            pointerEvents: 'auto',
                            userSelect: 'none',
                            WebkitUserSelect: 'none'
                        }}
                    />
                </div>
            ))}
        </div>
    );
};

export default PDFViewer;
