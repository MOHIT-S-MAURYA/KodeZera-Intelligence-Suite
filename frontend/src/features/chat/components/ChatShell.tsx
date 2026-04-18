import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

interface ChatShellProps {
    sidebar: ReactNode;
    main: ReactNode;
    statusBar?: ReactNode;
}

function clampWidth(value: number): number {
    if (value < 260) return 260;
    if (value > 360) return 360;
    return value;
}

export function ChatShell({ sidebar, main, statusBar }: ChatShellProps) {
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [tabletCollapsed, setTabletCollapsed] = useState(false);
    const [desktopSidebarWidth, setDesktopSidebarWidth] = useState(300);
    const resizingRef = useRef(false);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setMobileSidebarOpen(false);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const onMouseMove = (event: MouseEvent) => {
            if (!resizingRef.current) return;
            const width = clampWidth(event.clientX);
            setDesktopSidebarWidth(width);
        };

        const onMouseUp = () => {
            resizingRef.current = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    const startResize = () => {
        resizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    return (
        <div className="h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top_left,#e6f2ff_0%,#f8fbff_45%,#f3f7ff_100%)]">
            <div className="md:hidden flex h-14 items-center justify-between border-b border-border/60 bg-surface/90 px-4 backdrop-blur-sm">
                <button
                    onClick={() => setMobileSidebarOpen(true)}
                    className="rounded-lg p-2 text-text-main hover:bg-surface-hover"
                    aria-label="Open chat sidebar"
                >
                    <Menu className="h-5 w-5" />
                </button>
                <p className="text-sm font-semibold text-text-main">AI Chat</p>
                <div className="w-9" />
            </div>

            <div className="flex h-[calc(100dvh-56px)] md:h-[100dvh] min-h-0">
                <aside className="hidden md:flex lg:hidden border-r border-border/60 bg-surface/85 backdrop-blur-sm" style={{ width: tabletCollapsed ? 88 : 320 }}>
                    <div className="flex h-full w-full min-h-0 flex-col">
                        <div className="flex items-center justify-end border-b border-border/50 p-2">
                            <button
                                onClick={() => setTabletCollapsed((prev) => !prev)}
                                className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-main"
                                aria-label={tabletCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            >
                                {tabletCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden">
                            {sidebar}
                        </div>
                    </div>
                </aside>

                <aside className="hidden lg:flex border-r border-border/60 bg-surface/85 backdrop-blur-sm" style={{ width: desktopSidebarWidth }}>
                    <div className="min-h-0 flex-1 overflow-hidden">{sidebar}</div>
                </aside>

                <div
                    className="hidden lg:block w-1 cursor-col-resize bg-transparent hover:bg-accent-cyan/15"
                    onMouseDown={startResize}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize sidebar"
                />

                <main className="flex min-h-0 flex-1 flex-col">
                    {statusBar && (
                        <div className="border-b border-border/60 bg-surface/75 px-4 py-2 backdrop-blur-sm">
                            {statusBar}
                        </div>
                    )}
                    <div className="min-h-0 flex-1">{main}</div>
                </main>
            </div>

            {mobileSidebarOpen && (
                <>
                    <button
                        className="fixed inset-0 z-40 bg-slate-900/30"
                        onClick={() => setMobileSidebarOpen(false)}
                        aria-label="Close chat sidebar overlay"
                    />
                    <aside className="fixed inset-y-0 left-0 z-50 w-[88vw] max-w-[360px] border-r border-border/60 bg-surface shadow-xl">
                        <div className="flex h-14 items-center justify-between border-b border-border/60 px-3">
                            <p className="text-sm font-semibold text-text-main">Conversations</p>
                            <button
                                onClick={() => setMobileSidebarOpen(false)}
                                className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-main"
                                aria-label="Close chat sidebar"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="h-[calc(100%-56px)] overflow-hidden">{sidebar}</div>
                    </aside>
                </>
            )}
        </div>
    );
}
