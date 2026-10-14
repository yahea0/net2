import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Power, 
  Settings, 
  ShieldCheck, 
  Clock, 
  Zap, 
  AlertTriangle 
} from 'lucide-react';
import { NetStatus, Config, LogEntry } from './types';

const API_BASE = 'http://localhost:8080/api';

export const App: React.FC = () => {
  const [status, setStatus] = useState<NetStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [isRebooting, setIsRebooting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'status' | 'config' | 'logs'>('status');

  const fetchStatusAndLogs = async () => {
    try {
      const [resStatus, resLogs] = await Promise.all([
        fetch(`${API_BASE}/status`),
        fetch(`${API_BASE}/logs`)
      ]);
      if (resStatus.ok) setStatus(await resStatus.json());
      if (resLogs.ok) setLogs(await resLogs.json());
    } catch (e) {
      console.error("Backend offline or unreachable", e);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) setConfig(await res.json());
    } catch (e) {
      console.error("Config fetch error", e);
    }
  };

  useEffect(() => {
    fetchStatusAndLogs();
    fetchConfig();
    const interval = setInterval(fetchStatusAndLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleManualReboot = async () => {
    if (!confirm('هل أنت متأكد من رغبتك في إعادة تشغيل الراوتر فوراً؟')) return;
    setIsRebooting(true);
    try {
      await fetch(`${API_BASE}/reboot`, { method: 'POST' });
      fetchStatusAndLogs();
    } catch (err) {
      alert('تعذر إرسال أمر إعادة التشغيل');
    } finally {
      setTimeout(() => setIsRebooting(false), 5000);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        alert('تم حفظ الإعدادات بنجاح!');
        setActiveTab('status');
      }
    } catch (err) {
      alert('فشل في حفظ التعديلات');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12 select-none" dir="rtl">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur sticky top-0 z-50 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3 space-x-reverse">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wide">NetPulse Guard</h1>
            <p className="text-xs text-slate-400">حارس شبكة 3G والراوتر التلقائي</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 space-x-reverse">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
            status?.is_online 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ml-1.5 ${status?.is_online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {status?.is_online ? 'متصل' : 'منقطع'}
          </span>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <nav className="flex px-4 mt-4 gap-2">
        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'status' ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400 border border-slate-800'
          }`}
        >
          المراقبة الحية
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'logs' ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400 border border-slate-800'
          }`}
        >
          السجلات ({logs.length})
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'config' ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400 border border-slate-800'
          }`}
        >
          إعدادات الراوتر
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="px-4 mt-4 max-w-lg mx-auto">
        {activeTab === 'status' && (
          <div className="space-y-4">
            {/* Connection Signal Card */}
            <div className={`p-5 rounded-2xl border transition-all ${
              status?.is_online 
                ? 'bg-gradient-to-br from-slate-900 to-slate-900/60 border-emerald-500/30' 
                : 'bg-gradient-to-br from-rose-950/40 to-slate-900 border-rose-500/40'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 font-medium">زمن الاستجابة (Ping)</div>
                  <div className="text-3xl font-extrabold mt-1 tracking-tight text-white flex items-baseline gap-1">
                    {status?.is_online ? status.last_latency_ms : '---'}
                    <span className="text-xs text-slate-400 font-normal">ms</span>
                  </div>
                </div>
                <div className={`p-4 rounded-2xl ${
                  status?.is_online ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                }`}>
                  {status?.is_online ? <Wifi className="w-8 h-8" /> : <WifiOff className="w-8 h-8" />}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>تكرار الفشل: {status?.consecutive_failures || 0}</span>
                <span>إجمالي مرات الإنعاش: {status?.total_reboots || 0}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleManualReboot}
                disabled={isRebooting}
                className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 active:scale-95 transition-all text-xs font-semibold text-rose-300 disabled:opacity-50"
              >
                <Power className="w-4 h-4 text-rose-400" />
                {isRebooting ? 'جارٍ الإنعاش...' : 'إعادة تشغيل فورية'}
              </button>

              <button 
                onClick={fetchStatusAndLogs}
                className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 active:scale-95 transition-all text-xs font-semibold text-slate-300"
              >
                <RefreshCw className="w-4 h-4 text-cyan-400" />
                تحديث الحالة
              </button>
            </div>

            {/* Router Status Widget */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                بيانات التغطية ونظام الراوتر
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">عنوان الراوتر (IP):</span>
                  <span className="font-mono text-cyan-400">{config?.router_ip}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">طراز المحرك:</span>
                  <span className="uppercase font-semibold text-slate-200">{config?.router_type}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">الإصلاح التلقائي:</span>
                  <span className={config?.auto_reboot ? "text-emerald-400 font-semibold" : "text-amber-400"}>
                    {config?.auto_reboot ? "مفعّل" : "معطّل"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">آخر فحص:</span>
                  <span className="text-slate-300">{status ? new Date(status.last_check_time).toLocaleTimeString() : '---'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-2 max-h-[70vh] overflow-y-auto">
            <div className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-cyan-400" />
              سجل أحداث المراقبة التلقائية
            </div>
            {logs.slice().reverse().map((log, index) => (
              <div key={index} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/60 text-xs flex flex-col gap-1">
                <div className="flex justify-between items-center text-[10px] text-slate-500">
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className={`px-1.5 py-0.5 rounded font-mono ${
                    log.level === 'ERROR' ? 'bg-rose-500/20 text-rose-400' :
                    log.level === 'WARN' ? 'bg-amber-500/20 text-amber-400' :
                    log.level === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' :
                    'bg-cyan-500/20 text-cyan-400'
                  }`}>{log.level}</span>
                </div>
                <div className="text-slate-300 font-mono text-[11px] break-all">{log.message}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'config' && config && (
          <form onSubmit={handleSaveConfig} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-3.5">
            <div className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-cyan-400" />
              تكوين الاتصال بالراوتر
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">نوع الراوتر (Router Protocol)</label>
              <select 
                value={config.router_type} 
                onChange={(e) => setConfig({ ...config, router_type: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
              >
                <option value="huawei">Huawei HiLink (B310, B315, E5577, etc.)</option>
                <option value="zte">ZTE LTE / 3G Series (MF283, MF286)</option>
                <option value="generic">Generic Router (CGI / Basic Auth)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">عنوان IP الخاص بالراوتر</label>
              <input 
                type="text" 
                value={config.router_ip}
                onChange={(e) => setConfig({ ...config, router_ip: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">اسم المستخدم</label>
                <input 
                  type="text" 
                  value={config.router_username}
                  onChange={(e) => setConfig({ ...config, router_username: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">كلمة المرور</label>
                <input 
                  type="password" 
                  value={config.router_password}
                  onChange={(e) => setConfig({ ...config, router_password: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">فترة الفحص (ثوانٍ)</label>
                <input 
                  type="number" 
                  value={config.check_interval_seconds}
                  onChange={(e) => setConfig({ ...config, check_interval_seconds: parseInt(e.target.value) || 5 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">أقصى مرات فشل قبل الإنعاش</label>
                <input 
                  type="number" 
                  value={config.max_consecutive_failures}
                  onChange={(e) => setConfig({ ...config, max_consecutive_failures: parseInt(e.target.value) || 3 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input 
                type="checkbox"
                id="auto_reboot"
                checked={config.auto_reboot}
                onChange={(e) => setConfig({ ...config, auto_reboot: e.target.checked })}
                className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-4 h-4"
              />
              <label htmlFor="auto_reboot" className="text-xs text-slate-300 font-medium cursor-pointer">
                تفعيل الإنعاش التلقائي عند انقطاع الـ 3G
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all mt-4"
            >
              حفظ وتطبيق الإعدادات
            </button>
          </form>
        )}
      </main>
    </div>
  );
};

export default App;
