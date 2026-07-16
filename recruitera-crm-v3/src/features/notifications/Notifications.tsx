import { Link } from 'react-router-dom';
import { Bell, BellDot, Check } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useActivityMutations';
import { useMe } from '@/hooks/useMe';
import { fmtDate } from '@/lib/format';

export default function Notifications() {
  const { data, isLoading, error } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const me = useMe();

  if (error) return <div className="p-6 text-bad">Error: {String((error as Error).message)}</div>;
  const unread = (data ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-text">Notifications</h1>
          <p className="text-[12.5px] text-text-3 mt-0.5">
            {isLoading ? 'Loading…' : `${unread} unread of ${data?.length ?? 0}`}
          </p>
        </div>
        <div className="flex-1" />
        {unread > 0 && me.data?.id && (
          <button
            onClick={() => markAllRead.mutate(me.data!.id)}
            disabled={markAllRead.isPending}
            className="h-[34px] px-4 rounded-lg border border-border bg-surface text-[13px] font-semibold text-text-2 hover:bg-surface-2 disabled:opacity-60"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
        {!isLoading && (data?.length ?? 0) === 0 && <div className="p-8 text-center text-[12.5px] text-text-3">Inbox zero.</div>}
        {data?.map((n) => {
          const isUnread = !n.read_at;
          return (
            <div key={n.id} className={`px-4 py-3 border-t border-border first:border-0 flex items-start gap-3 ${isUnread ? 'bg-accent-soft/30' : ''}`}>
              <div className="mt-0.5">
                {isUnread ? <BellDot size={16} className="text-accent-ink" /> : <Bell size={16} className="text-text-3" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {n.kind && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-3 bg-surface-2 px-1.5 py-0.5 rounded">{n.kind}</span>
                  )}
                  {n.title && <span className="text-[13px] font-semibold text-text">{n.title}</span>}
                  <span className="ml-auto text-[11px] text-text-4">{fmtDate(n.created_at)}</span>
                </div>
                {n.body && <div className="text-[12.5px] text-text-2 mt-1 whitespace-pre-wrap">{n.body}</div>}
                <div className="flex items-center gap-3 mt-1.5">
                  {n.account_id && (
                    <Link to={`/companies/${n.account_id}`} className="text-[11.5px] text-accent-ink hover:underline">
                      Open company →
                    </Link>
                  )}
                  {isUnread && (
                    <button
                      onClick={() => markRead.mutate(n.id)}
                      className="inline-flex items-center gap-1 text-[11px] text-text-3 hover:text-text"
                    >
                      <Check size={11} /> Mark read
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
