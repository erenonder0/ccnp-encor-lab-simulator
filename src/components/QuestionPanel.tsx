import { useState } from 'react';
import type { PublicItem } from '../api';
import TopologyView from './TopologyView';

type Tab = 'guidelines' | 'tasks' | 'topology';

export default function QuestionPanel({ item, onDeviceClick }: { item: PublicItem; onDeviceClick: (d: string) => void }) {
  const [tab, setTab] = useState<Tab>('tasks');

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-medium ${
        tab === id ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-zinc-800">
        <TabBtn id="guidelines" label="Guidelines" />
        <TabBtn id="tasks" label="Tasks" />
        <TabBtn id="topology" label="Topology" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'guidelines' && (
          <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-300">
            {item.guidelines.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ol>
        )}
        {tab === 'tasks' && (
          <div>
            <p className="mb-3 text-sm text-zinc-400">
              The Operations team started configuring several activities. Complete the configurations for the tasks below:
            </p>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-zinc-100">
              {item.tasks.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </div>
        )}
        {tab === 'topology' && <TopologyView item={item} onDeviceClick={onDeviceClick} />}
      </div>
    </div>
  );
}
