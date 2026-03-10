import { useState, ComponentProps } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ImageOff } from 'lucide-react';

type MotionImgProps = ComponentProps<typeof motion.img>;

interface LazyImageProps extends MotionImgProps {
    fallback?: React.ReactNode;
}

export const LazyImage = ({
    src,
    alt,
    className,
    fallback,
    ...props
}: LazyImageProps) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);

    if (!src || hasError) {
        if (fallback) return <>{fallback}</>;
        return (
            <div className={cn("w-full h-full bg-slate-100 flex items-center justify-center text-slate-300", className)}>
                <ImageOff className="w-12 h-12" />
            </div>
        );
    }

    return (
        <>
            <AnimatePresence>
                {!isLoaded && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className={cn("absolute inset-0 bg-slate-100 animate-pulse", className)}
                    />
                )}
            </AnimatePresence>

            <motion.img
                src={src}
                alt={alt}
                initial={{ opacity: 0 }}
                animate={{ opacity: isLoaded ? 1 : 0 }}
                transition={{ duration: 0.5 }}
                onLoad={() => setIsLoaded(true)}
                onError={() => setHasError(true)}
                className={cn("w-full h-full object-cover", className)}
                loading="lazy"
                {...props}
            />
        </>
    );
};
