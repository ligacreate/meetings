import { BookOpen } from 'lucide-react';
import { Notebook } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { LazyImage } from '@/components/ui/lazy-image';

interface NotebooksViewProps {
  notebooks: Notebook[];
}

const NotebooksView = ({ notebooks }: NotebooksViewProps) => {
  const handleBuyNotebook = (notebook: Notebook) => {
    const url = notebook.pdf_url || 'https://izdatelstvo.skrebeyko.ru';
    window.open(url, '_blank');
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <AnimatePresence>
        {notebooks.map((notebook, index) => (
          <motion.div
            key={notebook.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className="clean-card group flex flex-col rounded-3xl overflow-hidden hover:shadow-lg transition-all duration-500"
          >
            <div className="flex flex-row p-6 gap-6 h-full">
              {/* Image */}
              <div className="w-24 h-32 md:w-32 md:h-40 shrink-0 rounded-xl overflow-hidden bg-muted relative">
                <LazyImage
                  src={notebook.image_url}
                  alt={notebook.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  fallback={
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <BookOpen className="w-8 h-8" />
                    </div>
                  }
                />
                {/* Shine effect */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>

              {/* Content */}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-display font-bold text-slate-900 mb-2 leading-tight group-hover:text-primary transition-colors">
                    {notebook.title}
                  </h3>
                  {notebook.description && (
                    <p className="text-sm text-slate-600 line-clamp-3 mb-4 leading-relaxed">
                      {notebook.description}
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => handleBuyNotebook(notebook)}
                    className="px-5 py-2 rounded-full bg-secondary hover:bg-primary text-secondary-foreground hover:text-primary-foreground text-sm font-medium transition-all duration-300 w-full sm:w-auto text-center"
                  >
                    Почитать больше
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default NotebooksView;
