import React, { useState, useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { Shield, Lock, Key, FileText, CheckCircle } from 'lucide-react';

const icons = [Shield, Lock, Key, FileText, CheckCircle];

const FloatingParticles = ({ count = 15 }) => {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e) => {
            setMousePos({
                x: (e.clientX / window.innerWidth - 0.5) * 50, // -25 to 25
                y: (e.clientY / window.innerHeight - 0.5) * 50, // -25 to 25
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    const particles = Array.from({ length: count }, (_, i) => {
        const Icon = icons[Math.floor(Math.random() * icons.length)];

        // Very dark, solid colors for maximum contrast against light background
        const colors = [
            '#0f172a', // Slate 900
            '#1e3a8a', // Blue 900
            '#581c87', // Purple 900
            '#881337', // Rose 900
            '#064e3b', // Emerald 900
        ];

        return {
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 25 + 25, // Slightly larger icons
            duration: Math.random() * 20 + 15,
            delay: Math.random() * 5,
            Icon: Icon,
            color: colors[Math.floor(Math.random() * colors.length)],
            depth: Math.random() * 2 + 0.5, // Parallax depth 0.5 to 2.5
            rotate: Math.random() * 360,
        };
    });

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                pointerEvents: 'none',
                zIndex: 0,
            }}
        >
            {particles.map((particle) => (
                <motion.div
                    key={particle.id}
                    style={{
                        position: 'absolute',
                        left: `${particle.x}%`,
                        top: `${particle.y}%`,
                        color: particle.color,
                        opacity: 0.15,
                        filter: particle.depth > 1.5 ? 'blur(2px)' : 'none',
                    }}
                    animate={{
                        x: mousePos.x * particle.depth,
                        y: mousePos.y * particle.depth,
                        rotate: particle.rotate + 360,
                    }}
                    transition={{
                        x: { type: 'spring', stiffness: 50, damping: 20 },
                        y: { type: 'spring', stiffness: 50, damping: 20 },
                        rotate: { duration: particle.duration, repeat: Infinity, ease: 'linear' },
                    }}
                >
                    <motion.div
                        animate={{
                            scale: [1, 1.1, 1],
                            opacity: [0.8, 1, 0.8] // Near solid opacity for bold dark appearance
                        }}
                        transition={{
                            duration: particle.duration / 2,
                            repeat: Infinity,
                            ease: 'easeInOut'
                        }}
                    >
                        <particle.Icon size={particle.size} strokeWidth={2} />
                    </motion.div>
                </motion.div>
            ))}
        </div>
    );
};

export default FloatingParticles;
