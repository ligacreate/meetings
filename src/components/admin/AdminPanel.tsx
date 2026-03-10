import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EventsAdmin from './EventsAdmin';
import QuestionsAdmin from './QuestionsAdmin';
import CitiesAdmin from './CitiesAdmin';
import NotebooksAdmin from './NotebooksAdmin';
import InstagramExport from './InstagramExport';

import { Event, Notebook } from '@/types';
import { motion } from 'framer-motion';

interface AdminPanelProps {
  userRole: 'admin' | 'host';
  events: Event[];
  questions: string[];
  cities: string[];
  notebooks: Notebook[];
  onEventsChange: (events: Event[]) => void;
  onQuestionsChange: (questions: string[]) => void;
  onCitiesChange: (cities: string[]) => void;
  onNotebooksChange: (notebooks: Notebook[]) => void;
  onDataReload: () => void;
}

const AdminPanel = ({ userRole, ...props }: AdminPanelProps) => {
  const [activeTab, setActiveTab] = useState(userRole === 'host' ? 'events' : 'events');

  const tabs = userRole === 'admin'
    ? [
      { value: 'events', label: 'События' },
      { value: 'questions', label: 'Вопросы' },
      { value: 'cities', label: 'Города' },
      { value: 'notebooks', label: 'Блокноты' },
      { value: 'instagram', label: 'Instagram' }
    ]
    : [{ value: 'events', label: 'События' }];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-8">
      <div className="overflow-x-auto pb-2 no-scrollbar">
        <TabsList className="w-full justify-start bg-transparent p-0 gap-2 h-auto">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-full px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground border border-transparent data-[state=active]:border-primary transition-all duration-300"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="clean-card p-6 md:p-8"
      >
        <TabsContent value="events" className="mt-0">
          <EventsAdmin
            events={props.events}
            cities={props.cities}
            onEventsChange={props.onEventsChange}
            onCitiesChange={props.onCitiesChange}
          />
        </TabsContent>

        {userRole === 'admin' && (
          <>
            <TabsContent value="questions" className="mt-0">
              <QuestionsAdmin
                questions={props.questions}
                onQuestionsChange={props.onQuestionsChange}
              />
            </TabsContent>

            <TabsContent value="cities" className="mt-0">
              <CitiesAdmin
                cities={props.cities}
                onCitiesChange={props.onCitiesChange}
              />
            </TabsContent>

            <TabsContent value="notebooks" className="mt-0">
              <NotebooksAdmin
                notebooks={props.notebooks}
                onNotebooksChange={props.onNotebooksChange}
              />
            </TabsContent>

            <TabsContent value="instagram" className="mt-0">
              <InstagramExport events={props.events} />
            </TabsContent>
          </>
        )}
      </motion.div>
    </Tabs>
  );
};

export default AdminPanel;

