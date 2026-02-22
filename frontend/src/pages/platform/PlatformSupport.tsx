import React, { useState } from 'react';
import { Headphones, AlertCircle, CheckCircle, Plus, Clock, ExternalLink } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';

interface Ticket {
    id: string;
    subject: string;
    tenant: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'resolved';
    created_at: string;
    last_updated: string;
}

export const PlatformSupport: React.FC = () => {
    const [tickets, setTickets] = useState<Ticket[]>([
        { id: 'T-1001', subject: 'API Latency Issues', tenant: 'Acme Corp', priority: 'high', status: 'open', created_at: '2024-03-15T10:00:00', last_updated: '2024-03-15T10:30:00' },
        { id: 'T-1002', subject: 'Billing Inquiry', tenant: 'TechStart Inc', priority: 'medium', status: 'in_progress', created_at: '2024-03-14T14:00:00', last_updated: '2024-03-15T09:00:00' },
        { id: 'T-1003', subject: 'Feature Request: Custom Models', tenant: 'Global Solutions', priority: 'low', status: 'resolved', created_at: '2024-03-10T09:00:00', last_updated: '2024-03-12T16:00:00' },
    ]);
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
    const [newTicket, setNewTicket] = useState({ subject: '', tenant: '', priority: 'medium', description: '' });
    const [accessReason, setAccessReason] = useState('');

    const handleCreateTicket = () => {
        const ticket: Ticket = {
            id: `T-${1000 + tickets.length + 1}`,
            subject: newTicket.subject,
            tenant: newTicket.tenant || 'Internal',
            priority: newTicket.priority as any,
            status: 'open',
            created_at: new Date().toISOString(),
            last_updated: new Date().toISOString(),
        };
        setTickets([ticket, ...tickets]);
        setIsTicketModalOpen(false);
        setNewTicket({ subject: '', tenant: '', priority: 'medium', description: '' });
    };

    const handleRequestAccess = () => {
        alert(`Emergency access requested for reason: ${accessReason}`);
        setIsAccessModalOpen(false);
        setAccessReason('');
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'critical': return 'error';
            case 'high': return 'warning';
            case 'medium': return 'info';
            default: return 'default';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open': return 'error';
            case 'in_progress': return 'warning';
            case 'resolved': return 'success';
            default: return 'default';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Support & Emergency Access</h1>
                    <p className="text-gray-600 mt-1">Manage support requests and emergency access</p>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        icon={<AlertCircle className="w-4 h-4" />}
                        onClick={() => setIsAccessModalOpen(true)}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                        Request Emergency Access
                    </Button>
                    <Button
                        variant="primary"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={() => setIsTicketModalOpen(true)}
                    >
                        Open Ticket
                    </Button>
                </div>
            </div>

            {/* Support Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Headphones className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Open Tickets</p>
                            <p className="text-2xl font-bold text-gray-900">{tickets.filter(t => t.status === 'open').length}</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Resolved Total</p>
                            <p className="text-2xl font-bold text-gray-900">{tickets.filter(t => t.status === 'resolved').length}</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center">
                            <Clock className="w-6 h-6 text-yellow-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Avg Response Time</p>
                            <p className="text-2xl font-bold text-gray-900">2.4h</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Support Tickets */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Support Tickets</h2>
                <div className="space-y-4">
                    {tickets.map((ticket) => (
                        <div key={ticket.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-between">
                            <div className="flex items-start gap-4">
                                <div className={`w-2 h-2 rounded-full mt-2 ${ticket.status === 'resolved' ? 'bg-green-500' : 'bg-blue-500'}`} />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-medium text-gray-900">{ticket.subject}</h3>
                                        <Badge variant={getStatusColor(ticket.status) as any}>{ticket.status.replace('_', ' ')}</Badge>
                                        <span className="text-xs text-gray-500">{ticket.id}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Tenant: <span className="font-medium">{ticket.tenant}</span> • Updated {new Date(ticket.last_updated).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <Badge variant={getPriorityColor(ticket.priority) as any}>{ticket.priority}</Badge>
                                <Button variant="ghost" size="sm" icon={<ExternalLink className="w-4 h-4" />}>
                                    View
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Create Ticket Modal */}
            <Modal
                isOpen={isTicketModalOpen}
                onClose={() => setIsTicketModalOpen(false)}
                title="Open New Support Ticket"
            >
                <div className="space-y-4">
                    <Input
                        label="Subject"
                        value={newTicket.subject}
                        onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                        placeholder="Brief summary of the issue"
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
                        <Input
                            value={newTicket.tenant}
                            onChange={(e) => setNewTicket({ ...newTicket, tenant: e.target.value })}
                            placeholder="Affected Tenant (Optional)"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                        <select
                            value={newTicket.priority}
                            onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500"
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                            value={newTicket.description}
                            onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500"
                            placeholder="Detailed description of the issue..."
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={() => setIsTicketModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" onClick={handleCreateTicket}>Create Ticket</Button>
                    </div>
                </div>
            </Modal>

            {/* Access Request Modal */}
            <Modal
                isOpen={isAccessModalOpen}
                onClose={() => setIsAccessModalOpen(false)}
                title="Request Emergency Access"
            >
                <div className="space-y-4">
                    <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                        <div className="flex gap-2">
                            <AlertCircle className="w-5 h-5 text-red-600" />
                            <p className="text-sm text-red-800">
                                Emergency access grants temporary administrative access to tenant data.
                                This action is strictly audited and monitored.
                            </p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Justification</label>
                        <textarea
                            value={accessReason}
                            onChange={(e) => setAccessReason(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500"
                            placeholder="Reason for emergency access..."
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={() => setIsAccessModalOpen(false)}>Cancel</Button>
                        <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleRequestAccess}>Request Access</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
