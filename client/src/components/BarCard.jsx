import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// The one bar chart every dashboard uses.
// data: [{ [xKey]: 'name', someKey: 3, ... }]   series: [{ key, label, color }]
// horizontal = bars run left to right (better for long names).
export default function BarCard({ title, data, xKey, series, horizontal = false, loading, error, empty = 'Nothing to show.', height = 260 }) {
  const rows = data || [];
  const hasData = rows.some((r) => series.some((s) => r[s.key] > 0));
  const xAxis = horizontal ? { type: 'number', allowDecimals: false } : { dataKey: xKey, tick: { fontSize: 12 } };
  const yAxis = horizontal
    ? { type: 'category', dataKey: xKey, width: 120, tick: { fontSize: 12 } }
    : { allowDecimals: false };

  return (
    <section className="rounded bg-white p-4 shadow">
      <h2 className="mb-2 font-semibold text-slate-800">{title}</h2>
      {loading && !data && <p className="text-sm text-slate-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && !hasData && <p className="text-sm text-slate-500">{empty}</p>}
      {data && hasData && (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis {...xAxis} />
              <YAxis {...yAxis} />
              <Tooltip />
              {series.length > 1 && <Legend />}
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}