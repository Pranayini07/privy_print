import React, { useEffect } from 'react';

const MouseGlow = () => {
    useEffect(() => {
        const handleMouseMove = (e) => {
            const { clientX: x, clientY: y } = e;
            document.documentElement.style.setProperty('--mouse-x', `${x}px`);
            document.documentElement.style.setProperty('--mouse-y', `${y}px`);
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div
            className="mouse-glow"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: -1,
                background: 'radial-gradient(600px circle at var(--mouse-x, 50vw) var(--mouse-y, 50vh), rgba(59, 130, 246, 0.15), transparent 40%)',
            }}
        />
    );
};

export default MouseGlow;
