import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';

const Navbar = () => {
    const [scrolled, setScrolled] = useState(false);
    const [hoveredLink, setHoveredLink] = useState(null);
    const location = useLocation();
    const { scrollY } = useScroll();

    useMotionValueEvent(scrollY, 'change', (latest) => {
        setScrolled(latest > 50);
    });

    const navLinks = [
        { path: '/', label: 'UPLOAD' },
        { path: '/access', label: 'ACCESS' },
        { path: '/nearby-shops', label: 'NEARBY SHOPS' },
    ];

    return (
        <motion.nav
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1.5rem 2rem',
                borderBottom: '1px solid var(--glass-border)',
                backdropFilter: scrolled ? 'blur(20px)' : 'blur(10px)',
                background: scrolled ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.4)',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                transition: 'all 0.3s ease',
            }}
        >
            <Link
                to="/"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--text-primary)' }}
            >
                <motion.div
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.6 }}
                >
                    <Shield size={32} color="var(--primary)" />
                </motion.div>
                <span style={{ fontSize: '1.5rem', fontWeight: '800', letterSpacing: '1px' }} className="glow-text">
                    PRIVY PRINT
                </span>
            </Link>

            <div style={{ display: 'flex', gap: '2rem' }}>
                {navLinks.map((link) => {
                    const isActive = location.pathname === link.path;
                    return (
                        <Link
                            key={link.path}
                            to={link.path}
                            onMouseEnter={() => setHoveredLink(link.path)}
                            onMouseLeave={() => setHoveredLink(null)}
                            style={{
                                color: isActive ? 'var(--neon-blue)' : 'var(--text-secondary)',
                                textDecoration: 'none',
                                fontSize: '0.9rem',
                                fontWeight: '500',
                                position: 'relative',
                                paddingBottom: '0.3rem',
                                transition: 'color 0.3s ease',
                            }}
                        >
                            {link.label}
                            <motion.div
                                style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    height: '2px',
                                    background: 'linear-gradient(90deg, var(--primary), var(--neon-purple))',
                                }}
                                initial={{ scaleX: isActive ? 1 : 0 }}
                                animate={{
                                    scaleX: isActive || hoveredLink === link.path ? 1 : 0,
                                }}
                                transition={{ duration: 0.3 }}
                            />
                        </Link>
                    );
                })}
            </div>
        </motion.nav>
    );
};

export default Navbar;
