export interface NetStatus {
  is_online: boolean;
  last_latency_ms: number;
  consecutive_failures: number;
  last_check_time: string;
  last_reboot_time: string;
  total_reboots: number;
}

export interface Config {
  router_ip: string;
  router_username: string;
  router_password: string;
  router_type: 'huawei' | 'zte' | 'generic';
  check_interval_seconds: number;
  max_consecutive_failures: number;
  target_host: string;
  auto_reboot: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}
