import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '@/lib/auth';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/admin');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка входа';
      toast({ title: 'Не удалось войти', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout showFooter={false}>
      <div className="max-w-sm mx-auto py-12 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-display font-medium">Вход в админку</h1>
          <p className="text-sm text-muted-foreground">
            Тот же email и пароль, что в Саду.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !email || !password}
          >
            {submitting ? 'Входим…' : 'Войти'}
          </Button>
        </form>
      </div>
    </MainLayout>
  );
};

export default Login;
