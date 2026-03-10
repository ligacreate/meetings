import { useState, useRef } from 'react';
import { toPng } from 'html-to-image';
import { saveAs } from 'file-saver';
import { Event } from '@/types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Instagram } from 'lucide-react';
import { getMonthGenitive } from '@/lib/dateUtils';
import { Label } from '@/components/ui/label';

interface InstagramExportProps {
    events: Event[];
}

const InstagramExport = ({ events }: InstagramExportProps) => {
    const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id.toString() || '');
    const [isGenerating, setIsGenerating] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    const selectedEvent = events.find(e => e.id.toString() === selectedEventId);

    const handleDownload = async () => {
        if (!cardRef.current || !selectedEvent) return;

        setIsGenerating(true);
        try {
            const dataUrl = await toPng(cardRef.current, {
                quality: 1.0,
                pixelRatio: 2,
            });

            const filename = `instagram-card-${selectedEvent.date}-${selectedEvent.title.slice(0, 20)}.png`
                .replace(/[^a-z0-9]/gi, '_')
                .toLowerCase();

            saveAs(dataUrl, filename);
        } catch (err) {
            console.error('Failed to generate image', err);
        } finally {
            setIsGenerating(false);
        }
    };

    if (!selectedEvent) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                Нет доступных событий для экспорта
            </div>
        );
    }

    const eventDate = new Date(selectedEvent.date + 'T00:00:00');
    const dateStr = `${eventDate.getDate()} ${getMonthGenitive(eventDate)}`;

    return (
        <div className="grid lg:grid-cols-[300px_1fr] gap-8 items-start">
            <div className="space-y-6">
                <div className="clean-card p-6 space-y-6">
                    <div className="space-y-2">
                        <Label className="text-muted-foreground">Выберите событие</Label>
                        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                            <SelectTrigger className="rounded-xl bg-background border-input text-foreground">
                                <SelectValue placeholder="Выберите событие" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border-border text-foreground">
                                {events.map((event) => (
                                    <SelectItem key={event.id} value={event.id.toString()}>
                                        {event.date} - {event.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        onClick={handleDownload}
                        className="w-full h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Генерация...
                            </>
                        ) : (
                            <>
                                <Download className="mr-2 h-4 w-4" />
                                Скачать PNG
                            </>
                        )}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                        Размер: 1080x1350px (4:5)<br />
                        Идеально для постов в Instagram
                    </p>
                </div>
            </div>

            <div className="flex justify-center bg-muted/30 p-8 rounded-3xl overflow-hidden border border-border/50 backdrop-blur-sm">
                <div className="relative origin-top transform scale-[0.4] sm:scale-[0.5] md:scale-[0.6] lg:scale-[0.7] xl:scale-[0.8]" style={{ width: '1080px', height: '1350px' }}>
                    <div
                        ref={cardRef}
                        className="w-[1080px] h-[1350px] bg-white relative flex flex-col overflow-hidden font-sans"
                    >
                        {/* Background Image */}
                        {selectedEvent.image_url ? (
                            <div className="absolute inset-0 z-0">
                                <img
                                    src={selectedEvent.image_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                                {/* Light overlay to ensure text readability */}
                                <div className="absolute inset-0 bg-white/40 backdrop-blur-md" />
                                <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-white/60" />
                            </div>
                        ) : (
                            <div
                                className="absolute inset-0 z-0"
                                style={{ background: selectedEvent.image_gradient || 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}
                            />
                        )}

                        {/* Content Container */}
                        <div className="relative z-10 flex-1 flex flex-col p-16 justify-between">

                            {/* Header */}
                            <div className="flex justify-between items-start">
                                <div className="bg-black text-white px-8 py-3 rounded-full text-2xl font-bold tracking-wider uppercase">
                                    {selectedEvent.category}
                                </div>
                                <div className="flex items-center gap-3 text-3xl font-medium text-gray-900">
                                    <Instagram className="w-10 h-10" />
                                    <span>@skrebeykoru</span>
                                </div>
                            </div>

                            {/* Main Content */}
                            <div className="space-y-10 mt-20">
                                <div className="space-y-4">
                                    <div className="text-5xl text-gray-700 font-medium tracking-tight">
                                        {dateStr} / {selectedEvent.time}
                                    </div>
                                    <div className="h-1.5 w-32 bg-black rounded-full" />
                                </div>

                                <h1 className="text-[100px] leading-[1.05] font-bold text-gray-900 tracking-tight">
                                    {selectedEvent.title}
                                </h1>

                                {selectedEvent.speaker && (
                                    <div className="flex items-center gap-4 pt-4">
                                        <div className="w-16 h-0.5 bg-black rounded-full" />
                                        <p className="text-4xl text-gray-800 font-medium">
                                            {selectedEvent.speaker}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Spacer */}
                            <div className="flex-1" />

                            {/* Footer */}
                            <div className="space-y-8 pb-8">
                                <div className="flex items-center gap-4 text-3xl text-gray-800 font-medium bg-white px-8 py-4 rounded-2xl inline-flex w-fit shadow-sm">
                                    <div className="w-3 h-3 rounded-full bg-black" />
                                    {selectedEvent.city}, {selectedEvent.location}
                                </div>

                                {selectedEvent.price && (
                                    <div className="text-4xl font-bold text-gray-900 pl-2">
                                        Стоимость: {selectedEvent.price}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InstagramExport;
