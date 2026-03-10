import { useState } from 'react';
import { Lock, Shield, X, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PINS } from '@/data/initialData';
import AdminPanel from '@/components/admin/AdminPanel';
import { Event, Notebook } from '@/types';
import { motion } from 'framer-motion';

interface AdminViewProps {
  events: Event[];
  questions: string[];
  cities: string[];
  notebooks: Notebook[];
  onEventsChange: (events: Event[]) => void;
  onQuestionsChange: (questions: string[]) => void;
  onCitiesChange: (cities: string[]) => void;
  onNotebooksChange: (notebooks: Notebook[]) => void;
  onBack: () => void;
  onDataReload: () => void;
}

const AdminView = (props: AdminViewProps) => {
  const [userRole, setUserRole] = useState<'admin' | 'host' | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [loginError, setLoginError] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === PINS.ADMIN) {
      setUserRole('admin');
      setLoginError(false);
    } else if (pinInput === PINS.HOST) {
      setUserRole('host');
      setLoginError(false);
    } else {
      setLoginError(true);
      setPinInput('');
    }
  };

  const handleLogout = () => {
    setUserRole(null);
    setPinInput('');
    props.onBack();
  };

  if (!userRole) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="clean-card w-full max-w-md p-8 relative overflow-hidden"
        >
          {/* Background decoration */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />

          <button
            onClick={props.onBack}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-6 shadow-sm border border-border">
              <Lock className="w-8 h-8 text-foreground" />
            </div>
            <h2 className="text-2xl font-display font-semibold text-foreground mb-2">Административная панель</h2>
            <p className="text-muted-foreground text-center">Введите PIN-код для доступа</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <div className="relative">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    setLoginError(false);
                  }}
                  placeholder="••••"
                  className={`text-center text-3xl tracking-[0.5em] h-16 rounded-xl bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus:ring-primary/20 focus:border-primary/50 transition-all ${loginError ? 'border-destructive focus:border-destructive' : ''}`}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50">
                  <KeyRound className="w-5 h-5" />
                </div>
              </div>
              {loginError && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive text-center font-medium"
                >
                  Неверный PIN-код
                </motion.p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base transition-colors shadow-md shadow-primary/10"
              disabled={pinInput.length !== 4}
            >
              Войти
            </Button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="clean-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-secondary rounded-xl p-2.5">
            <Shield className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Админ-панель</h2>
            <p className="text-sm text-muted-foreground capitalize">Роль: {userRole === 'admin' ? 'Администратор' : 'Хост'}</p>
          </div>
        </div>
        <Button onClick={handleLogout} variant="ghost" className="rounded-full hover:bg-secondary hover:text-foreground text-muted-foreground" size="sm">
          Выйти
        </Button>
      </div>

      <AdminPanel userRole={userRole} {...props} />
    </div>
  );
};

export default AdminView;

