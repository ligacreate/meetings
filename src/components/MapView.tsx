import { useState, useEffect, useRef } from 'react';
import { X, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { Event } from '@/types';

interface MapViewProps {
  events: Event[];
  cities: string[];
  onClose: () => void;
}

// City coordinates (approximate)
const cityCoordinates: Record<string, [number, number]> = {
  'Москва': [37.6173, 55.7558],
  'Санкт-Петербург': [30.3351, 59.9311],
  'Казань': [49.1221, 55.7887],
  'Екатеринбург': [60.5974, 56.8389],
  'Новосибирск': [82.9346, 55.0084],
  'Онлайн': [37.6173, 55.7558]
};

const MapView = ({ events, cities, onClose }: MapViewProps) => {
  const [mapboxToken, setMapboxToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(true);
  const mapContainer = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = useRef<any>(null);

  const initializeMap = async (token: string) => {
    if (!mapContainer.current) return;

    try {
      const mapboxgl = await import('mapbox-gl');
      await import('mapbox-gl/dist/mapbox-gl.css');

      (mapboxgl as any).accessToken = token;

      map.current = new (mapboxgl as any).Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11', // Light mode map
        center: [37.6, 55.7], // Moscow default
        zoom: 3,
        projection: 'globe'
      });

      map.current.on('style.load', () => {
        map.current.setFog({
          color: 'rgb(255, 255, 255)', // Light haze
          'high-color': 'rgb(220, 230, 250)', // Light blue sky
          'horizon-blend': 0.2,
          'space-color': 'rgb(255, 255, 255)',
          'star-intensity': 0
        });
      });

      const cityEventCount: Record<string, number> = {};
      events.forEach(event => {
        if (event.city !== 'Онлайн' && event.city !== 'Все') {
          cityEventCount[event.city] = (cityEventCount[event.city] || 0) + 1;
        }
      });

      Object.entries(cityEventCount).forEach(([city, count]) => {
        const coords = cityCoordinates[city];
        if (coords) {
          const el = document.createElement('div');
          el.className = 'map-marker';
          el.style.cssText = `
            width: ${40 + count * 5}px;
            height: ${40 + count * 5}px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.3);
            backdrop-filter: blur(4px);
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            font-size: 14px;
            animation: pulse-ring 2s infinite;
          `;

          el.innerHTML = `<div style="width: 8px; height: 8px; background: white; border-radius: 50%; box-shadow: 0 0 10px white;"></div>`;

          const popup = new (mapboxgl as any).Popup({ offset: 25, className: 'obsidian-popup' }).setHTML(`
            <div style="padding: 8px; color: black;">
              <strong>${city}</strong><br/>
              ${count} ${count === 1 ? 'событие' : count < 5 ? 'события' : 'событий'}
            </div>
          `);

          new (mapboxgl as any).Marker(el)
            .setLngLat(coords)
            .setPopup(popup)
            .addTo(map.current);
        }
      });

      map.current.addControl(
        new (mapboxgl as any).NavigationControl(),
        'top-right'
      );

      setShowTokenInput(false);
    } catch (error) {
      console.error('Error initializing map:', error);
      toast.error('Ошибка инициализации карты');
    }
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mapboxToken.trim()) {
      initializeMap(mapboxToken.trim());
    }
  };

  useEffect(() => {
    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="clean-card w-full max-w-4xl h-[70vh] rounded-3xl overflow-hidden flex flex-col relative shadow-2xl"
        >
          {/* Subtle gradient header line */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500/20 to-blue-500/20" />

          <div className="flex items-center justify-between p-6 border-b border-border/40 bg-white/50 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <div className="bg-secondary p-2 rounded-xl">
                <Map className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-display font-semibold text-foreground">Карта событий</h2>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex-1 bg-muted/20 relative">
            {showTokenInput ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-10 p-6">
                <div className="max-w-md w-full space-y-6 text-center">
                  <div className="mx-auto w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-4">
                    <Map className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-medium text-foreground">Требуется Mapbox Token</h3>
                  <p className="text-sm text-muted-foreground">
                    Для отображения карты требуется токен Mapbox. Получите бесплатный токен на{' '}
                    <a
                      href="https://mapbox.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-primary hover:text-primary/80 transition-colors"
                    >
                      mapbox.com
                    </a>
                  </p>
                  <form onSubmit={handleTokenSubmit} className="space-y-4">
                    <Input
                      type="text"
                      value={mapboxToken}
                      onChange={(e) => setMapboxToken(e.target.value)}
                      placeholder="pk.eyJ1..."
                      className="rounded-xl bg-white border-border text-foreground placeholder:text-muted-foreground focus:ring-primary h-12 text-center"
                    />
                    <Button type="submit" className="w-full rounded-xl h-12 font-medium">
                      Показать карту
                    </Button>
                  </form>
                </div>
              </div>
            ) : null}
            <div ref={mapContainer} className="w-full h-full" />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MapView;
