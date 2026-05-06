import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden p-6">
      {/* Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="clean-card max-w-md w-full p-8 md:p-12 relative z-10 text-center space-y-8">

        <div className="relative inline-block">
          <div className="text-[120px] font-display font-bold leading-none bg-clip-text text-transparent bg-gradient-to-b from-foreground/5 to-foreground/20 select-none">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <AlertCircle className="w-16 h-16 text-primary drop-shadow-sm" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-display font-medium text-foreground tracking-tight">Страница не найдена</h1>
          <p className="text-muted-foreground">
            Кажется, вы забрели в неизведанную часть пустоты.
          </p>
        </div>

        <Link to="/">
          <Button className="rounded-full px-8 py-6 w-full md:w-auto font-medium text-lg">
            <ArrowLeft className="mr-2 h-5 w-5" />
            Вернуться на главную
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
