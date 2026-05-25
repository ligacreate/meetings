import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAuthToken,
  getCurrentProfile,
  isAllowedAdminId,
  logout,
  type Profile,
} from '@/lib/auth';
import MainLayout from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type GuardState =
  | { status: 'loading' }
  | { status: 'ok'; profile: Profile }
  | { status: 'forbidden'; profile: Profile; reason: 'role' | 'allowlist' };

const Admin = () => {
  const [state, setState] = useState<GuardState>({ status: 'loading' });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!getAuthToken()) {
        navigate('/login');
        return;
      }
      try {
        const profile = await getCurrentProfile();
        if (cancelled) return;
        if (!profile) {
          navigate('/login');
          return;
        }
        if (profile.role !== 'admin') {
          setState({ status: 'forbidden', profile, reason: 'role' });
          return;
        }
        if (!isAllowedAdminId(profile.id)) {
          setState({ status: 'forbidden', profile, reason: 'allowlist' });
          return;
        }
        setState({ status: 'ok', profile });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Ошибка проверки доступа';
        toast({ title: 'Ошибка', description: message, variant: 'destructive' });
        navigate('/login');
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [navigate, toast]);

  if (state.status === 'loading') {
    return (
      <MainLayout showFooter={false}>
        <div className="text-center py-8 text-sm text-slate-500">Загрузка…</div>
      </MainLayout>
    );
  }

  if (state.status === 'forbidden') {
    const reasonText =
      state.reason === 'role'
        ? `У вашего аккаунта роль «${state.profile.role}», а нужна «admin».`
        : 'Ваш аккаунт не в списке разрешённых администраторов meetings.';
    return (
      <MainLayout showFooter={false}>
        <div className="max-w-sm mx-auto py-12 space-y-4 text-center">
          <h1 className="text-2xl font-display font-medium">Нет прав</h1>
          <p className="text-sm text-muted-foreground">{reasonText}</p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => navigate('/')}>Вернуться на главную</Button>
            <Button
              variant="outline"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Войти под другим аккаунтом
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout showFooter={false}>
      <div className="py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-medium">Админка</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Выйти
          </Button>
        </div>

        <Tabs defaultValue="notebooks">
          <TabsList>
            <TabsTrigger value="notebooks">Блокноты</TabsTrigger>
            <TabsTrigger value="questions">Вопросы</TabsTrigger>
          </TabsList>
          <TabsContent value="notebooks">
            <div className="py-8 text-center text-muted-foreground">
              Скоро. CRUD блокнотов появится в Phase 2.
            </div>
          </TabsContent>
          <TabsContent value="questions">
            <div className="py-8 text-center text-muted-foreground">
              Скоро. CRUD вопросов появится в Phase 3.
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Admin;
