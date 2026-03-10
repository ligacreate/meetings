import { useState, useEffect } from 'react';
import { RefreshCw, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReflectionViewProps {
  questions: string[];
}

const ReflectionView = ({ questions }: ReflectionViewProps) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  useEffect(() => {
    if (questions.length > 0) {
      setCurrentQuestionIndex(Math.floor(Math.random() * questions.length));
    }
  }, [questions.length]);

  const handleNextQuestion = () => {
    let newIndex = currentQuestionIndex;
    while (newIndex === currentQuestionIndex && questions.length > 1) {
      newIndex = Math.floor(Math.random() * questions.length);
    }
    setCurrentQuestionIndex(newIndex);
  };

  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="relative group perspective-1000" id="reflection-section">
      {/* Subtle light gradient glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/30 blur-3xl rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

      <div className="bg-primary text-white shadow-xl shadow-primary/20 rounded-3xl transition-all duration-300 relative overflow-hidden p-8 clean-hover group">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-white/20 text-white backdrop-blur-sm">
              <Pencil className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-display font-medium text-primary-foreground/90 tracking-wide">
              Вопрос дня
            </h3>
          </div>
          <button
            onClick={handleNextQuestion}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors flex items-center justify-center border border-white/10 group/btn"
            aria-label="Обновить вопрос"
          >
            <RefreshCw className="w-4 h-4 group-hover/btn:rotate-180 transition-transform duration-500" />
          </button>
        </div>

        <div className="min-h-[100px] flex items-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentQuestionIndex}
              initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(5px)' }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="text-lg md:text-xl font-display leading-relaxed text-white font-medium"
            >
              {questions[currentQuestionIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ReflectionView;

