import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { ChatMessageBlock } from '../../../services/rag.service';
import { SourcesPanel } from './SourcesPanel';

interface BlockRendererProps {
    block: ChatMessageBlock;
}

const PIE_COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#6366f1', '#ef4444', '#14b8a6'];

function TextBlock({ text }: { text: string }) {
    return (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-main">
            {text}
        </div>
    );
}

function TableBlock({ columns, rows }: { columns: string[]; rows: Array<Array<string | number | null>> }) {
    return (
        <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead className="bg-surface-hover">
                    <tr>
                        {columns.map((column) => (
                            <th key={column} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                                {column}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-t border-border">
                            {row.map((cell, cellIndex) => (
                                <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2 text-text-main">
                                    {cell ?? '-'}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ChartBlock({
    chartType,
    title,
    data,
    xKey,
    yKey,
}: {
    chartType?: 'bar' | 'line' | 'area' | 'pie';
    title?: string;
    data: Array<Record<string, string | number>>;
    xKey: string;
    yKey: string;
}) {
    const resolvedType = chartType || 'bar';

    if (!data.length) {
        return <div className="rounded-lg border border-border bg-surface p-3 text-xs text-text-muted">No chart data available.</div>;
    }

    return (
        <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            {title && <p className="text-sm font-semibold text-text-main">{title}</p>}
            <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    {resolvedType === 'line' ? (
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey={xKey} stroke="#64748b" fontSize={11} />
                            <YAxis stroke="#64748b" fontSize={11} />
                            <Tooltip />
                            <Line type="monotone" dataKey={yKey} stroke="#0ea5e9" strokeWidth={2} dot={false} />
                        </LineChart>
                    ) : resolvedType === 'area' ? (
                        <AreaChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey={xKey} stroke="#64748b" fontSize={11} />
                            <YAxis stroke="#64748b" fontSize={11} />
                            <Tooltip />
                            <Area type="monotone" dataKey={yKey} stroke="#0ea5e9" fill="#bae6fd" />
                        </AreaChart>
                    ) : resolvedType === 'pie' ? (
                        <PieChart>
                            <Tooltip />
                            <Pie data={data} dataKey={yKey} nameKey={xKey} outerRadius={85}>
                                {data.map((entry, index) => (
                                    <Cell key={`${String(entry[xKey])}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                ))}
                            </Pie>
                        </PieChart>
                    ) : (
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey={xKey} stroke="#64748b" fontSize={11} />
                            <YAxis stroke="#64748b" fontSize={11} />
                            <Tooltip />
                            <Bar dataKey={yKey} fill="#38bdf8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function ImageBlock({ url, alt, caption }: { url: string; alt?: string; caption?: string }) {
    return (
        <figure className="space-y-2">
            <img src={url} alt={alt || 'Generated image context'} className="max-h-80 w-full rounded-lg border border-border object-cover" loading="lazy" />
            {caption && <figcaption className="text-xs text-text-muted">{caption}</figcaption>}
        </figure>
    );
}

export function BlockRenderer({ block }: BlockRendererProps) {
    switch (block.type) {
        case 'text':
            return <TextBlock text={block.text} />;
        case 'table':
            return <TableBlock columns={block.columns} rows={block.rows} />;
        case 'chart':
            return <ChartBlock chartType={block.chartType} title={block.title} data={block.data} xKey={block.xKey} yKey={block.yKey} />;
        case 'image':
            return <ImageBlock url={block.url} alt={block.alt} caption={block.caption} />;
        case 'source_list':
            return <SourcesPanel sources={block.sources} />;
        case 'action_card':
            return (
                <div className="rounded-lg border border-accent-orange/30 bg-accent-orange/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent-orange">Approval Required</p>
                    <p className="mt-1 text-sm font-semibold text-text-main">{block.summary}</p>
                    <p className="mt-1 text-xs text-text-muted">Action type: {block.action_type}</p>
                </div>
            );
        default:
            return null;
    }
}
