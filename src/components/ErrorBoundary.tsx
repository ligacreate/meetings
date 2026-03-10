import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-background p-6 relative overflow-hidden">
                    {/* Background Effects */}
                    <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-destructive/5 rounded-full blur-[120px] pointer-events-none" />

                    <div className="clean-card max-w-lg w-full p-8 relative z-10 text-center shadow-lg">
                        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle className="w-8 h-8 text-destructive relative z-10" />
                        </div>

                        <h2 className="text-2xl font-display font-bold text-foreground mb-3">Что-то пошло не так</h2>
                        <p className="text-muted-foreground mb-8 leading-relaxed">
                            Произошла критическая ошибка. Мы уже работаем над устранением.
                        </p>

                        {this.state.error && (
                            <div className="text-left bg-muted/50 p-4 rounded-xl border border-border mb-8 relative group">
                                <p className="text-xs text-muted-foreground font-mono mb-2 uppercase tracking-wider">Error Details</p>
                                <pre className="text-xs text-destructive overflow-auto max-h-40 font-mono whitespace-pre-wrap">
                                    {this.state.error.toString()}
                                </pre>
                            </div>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 group"
                        >
                            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-700" />
                            Перезагрузить страницу
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
