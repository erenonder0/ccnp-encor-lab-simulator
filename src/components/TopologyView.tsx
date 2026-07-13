import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { PublicItem } from '../api';

export default function TopologyView({ item, onDeviceClick }: { item: PublicItem; onDeviceClick: (d: string) => void }) {
  const devices = Array.from(new Set(item.device_table?.map((r) => r.device) ?? []));
  return (
    <div className="space-y-4">
      {item.topology_image && (
        <div className="rounded border border-zinc-800 bg-white">
          <TransformWrapper minScale={0.5} maxScale={4} wheel={{ step: 0.15 }}>
            <TransformComponent wrapperClass="!w-full" contentClass="!w-full">
              <img src={item.topology_image} alt="Topology" className="max-h-[420px] w-auto select-none" draggable={false} />
            </TransformComponent>
          </TransformWrapper>
        </div>
      )}
      <p className="text-xs text-zinc-500">Görseli tekerlekle yakınlaştırabilir, sürükleyerek gezdirebilirsin.</p>
      {devices.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Konsol aç:</p>
          <div className="flex flex-wrap gap-2">
            {devices.map((d) => (
              <button
                key={d}
                onClick={() => onDeviceClick(d)}
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-emerald-300 hover:bg-zinc-700"
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
      {item.device_table && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-800 text-left text-zinc-300">
              <th className="border border-zinc-700 px-3 py-1.5">Device</th>
              <th className="border border-zinc-700 px-3 py-1.5">Interface</th>
              <th className="border border-zinc-700 px-3 py-1.5">IP</th>
            </tr>
          </thead>
          <tbody>
            {item.device_table.map((r, i) => (
              <tr key={i} className="text-zinc-200">
                <td className="border border-zinc-800 px-3 py-1">{r.device}</td>
                <td className="border border-zinc-800 px-3 py-1">{r.interface}</td>
                <td className="border border-zinc-800 px-3 py-1 font-mono">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
