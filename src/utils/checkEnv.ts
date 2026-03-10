import { toast } from "sonner";

export const checkEnvVariables = () => {
    const requiredVars = [
        { key: "VITE_SUPABASE_URL", name: "Supabase URL" },
        { key: "VITE_SUPABASE_PUBLISHABLE_KEY", name: "Supabase Key" },
    ];

    const missingVars = requiredVars.filter(
        (v) => !import.meta.env[v.key] || import.meta.env[v.key].includes("placeholder")
    );

    if (missingVars.length > 0) {
        const missingNames = missingVars.map((v) => v.name).join(", ");
        console.error(`Missing environment variables: ${missingNames}`);

        // We use a timeout to ensure the toast library is ready
        setTimeout(() => {
            toast.error("Ошибка конфигурации", {
                description: `Отсутствуют настройки: ${missingNames}. Приложение может работать некорректно.`,
                duration: 10000,
            });
        }, 1000);

        return false;
    }

    return true;
};
