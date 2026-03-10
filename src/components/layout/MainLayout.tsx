import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '@/assets/logo-final-correct.png';

interface MainLayoutProps {
    children: React.ReactNode;
    className?: string;
    showFooter?: boolean;
}

const MainLayout = ({ children, className = "", showFooter = true }: MainLayoutProps) => {
    return (
        <div className="min-h-screen flex flex-col relative z-10">
            <header className="w-full py-8 px-6 md:px-0">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* Removed invert for Light Mode, optimized hover state */}
                        <img src={logo} alt="Skrebeyko" className="h-16 md:h-20 object-contain opacity-100 transition-opacity" />
                    </motion.div>
                </div>
            </header>

            <main className={`flex-1 w-full max-w-4xl mx-auto px-6 md:px-0 pb-20 ${className}`}>
                <AnimatePresence mode="wait">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </main>

            {showFooter && (
                <footer className="w-full py-8 border-t border-border mt-auto">
                    <div className="max-w-4xl mx-auto px-6 md:px-0 text-center">
                        <a
                            href="https://izdatelstvo.skrebeyko.ru"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            izdatelstvo.skrebeyko.ru
                        </a>
                    </div>
                </footer>
            )}
        </div>
    );
};

export default MainLayout;
