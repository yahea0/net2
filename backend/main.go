package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"sync"
	"time"
)

type RouterType string

const (
	RouterHuawei  RouterType = "huawei"
	RouterZTE     RouterType = "zte"
	RouterGeneric RouterType = "generic"
)

type Config struct {
	RouterIP       string     `json:"router_ip"`
	RouterUsername string     `json:"router_username"`
	RouterPassword string     `json:"router_password"`
	RouterType     RouterType `json:"router_type"`
	CheckInterval  int        `json:"check_interval_seconds"`
	MaxFailures    int        `json:"max_consecutive_failures"`
	TargetHost     string     `json:"target_host"`
	AutoReboot     bool       `json:"auto_reboot"`
}

type NetStatus struct {
	IsOnline        bool      `json:"is_online"`
	LastLatencyMs   int64     `json:"last_latency_ms"`
	ConsecutiveFails int      `json:"consecutive_failures"`
	LastCheckTime   time.Time `json:"last_check_time"`
	LastRebootTime  time.Time `json:"last_reboot_time"`
	TotalReboots    int       `json:"total_reboots"`
}

type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
}

var (
	configLock sync.RWMutex
	currentCfg = Config{
		RouterIP:       "192.168.8.1",
		RouterUsername: "admin",
		RouterPassword: "admin",
		RouterType:     RouterHuawei,
		CheckInterval:  5,
		MaxFailures:    3,
		TargetHost:     "8.8.8.8:53",
		AutoReboot:     true,
	}

	statusLock sync.RWMutex
	appStatus  = NetStatus{
		IsOnline:         true,
		LastLatencyMs:    0,
		ConsecutiveFails: 0,
		LastCheckTime:    time.Now(),
		LastRebootTime:   time.Time{},
		TotalReboots:     0,
	}

	logsLock sync.Mutex
	logStore = make([]LogEntry, 0)
)

func addLog(level, message string) {
	logsLock.Lock()
	defer logsLock.Unlock()
	entry := LogEntry{
		Timestamp: time.Now(),
		Level:     level,
		Message:   message,
	}
	logStore = append(logStore, entry)
	if len(logStore) > 100 {
		logStore = logStore[1:]
	}
	log.Printf("[%s] %s", level, message)
}

func checkConnectivity(target string, timeout time.Duration) (bool, int64) {
	start := time.Now()
	conn, err := net.DialTimeout("tcp", target, timeout)
	if err != nil {
		return false, 0
	}
	defer conn.Close()
	latency := time.Since(start).Milliseconds()
	return true, latency
}

func triggerRouterReboot(cfg Config) error {
	addLog("WARN", fmt.Sprintf("Initiating router recovery protocol for [%s] at %s", cfg.RouterType, cfg.RouterIP))

	client := &http.Client{Timeout: 10 * time.Second}

	switch cfg.RouterType {
	case RouterHuawei:
		// Step A: Fetch Session & Token Info
		tokenURL := fmt.Sprintf("http://%s/api/webserver/SesTokInfo", cfg.RouterIP)
		req, err := http.NewRequest("GET", tokenURL, nil)
		if err != nil {
			return err
		}
		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("failed to reach Huawei router: %w", err)
		}
		defer resp.Body.Close()

		tokenBody, _ := io.ReadAll(resp.Body)
		tokenStr := string(tokenBody)

		var token string
		var sessionID string
		if idx := bytes.Index(tokenBody, []byte("<TokInfo>")); idx != -1 {
			end := bytes.Index(tokenBody[idx:], []byte("</TokInfo>"))
			if end != -1 {
				token = tokenStr[idx+9 : idx+end]
			}
		}
		if idx := bytes.Index(tokenBody, []byte("<SesInfo>")); idx != -1 {
			end := bytes.Index(tokenBody[idx:], []byte("</SesInfo>"))
			if end != -1 {
				sessionID = tokenStr[idx+9 : idx+end]
			}
		}

		// Step B: Send Reboot Command
		rebootURL := fmt.Sprintf("http://%s/api/device/control", cfg.RouterIP)
		xmlPayload := []byte(`<?xml version="1.0" encoding="UTF-8"?><request><Control>1</Control></request>`)
		rebootReq, err := http.NewRequest("POST", rebootURL, bytes.NewBuffer(xmlPayload))
		if err != nil {
			return err
		}
		rebootReq.Header.Set("Content-Type", "application/xml")
		if token != "" {
			rebootReq.Header.Set("__RequestVerificationToken", token)
		}
		if sessionID != "" {
			rebootReq.Header.Set("Cookie", sessionID)
		}

		rebootResp, err := client.Do(rebootReq)
		if err != nil {
			return fmt.Errorf("reboot request dispatch failed: %w", err)
		}
		defer rebootResp.Body.Close()

	case RouterZTE:
		rebootURL := fmt.Sprintf("http://%s/goform/goform_set_cmd_process", cfg.RouterIP)
		payload := bytes.NewBufferString("isTest=false&goformId=REBOOT_DEVICE")
		req, err := http.NewRequest("POST", rebootURL, payload)
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Referer", fmt.Sprintf("http://%s/index.html", cfg.RouterIP))

		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("ZTE reboot request failed: %w", err)
		}
		defer resp.Body.Close()

	case RouterGeneric:
		rebootURL := fmt.Sprintf("http://%s/reboot.cgi", cfg.RouterIP)
		req, err := http.NewRequest("POST", rebootURL, nil)
		if err != nil {
			return err
		}
		req.SetBasicAuth(cfg.RouterUsername, cfg.RouterPassword)
		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("generic reboot request failed: %w", err)
		}
		defer resp.Body.Close()
	}

	addLog("SUCCESS", "Router reset signal executed successfully. Awaiting network revival...")
	return nil
}

func monitorEngine() {
	for {
		configLock.RLock()
		cfg := currentCfg
		configLock.RUnlock()

		online, latency := checkConnectivity(cfg.TargetHost, 3*time.Second)

		statusLock.Lock()
		appStatus.LastCheckTime = time.Now()
		appStatus.IsOnline = online
		appStatus.LastLatencyMs = latency

		if online {
			if appStatus.ConsecutiveFails > 0 {
				addLog("INFO", fmt.Sprintf("Network restored. Latency: %d ms", latency))
			}
			appStatus.ConsecutiveFails = 0
		} else {
			appStatus.ConsecutiveFails++
			addLog("ERROR", fmt.Sprintf("Connection drop detected! Failure count: %d/%d", appStatus.ConsecutiveFails, cfg.MaxFailures))

			if cfg.AutoReboot && appStatus.ConsecutiveFails >= cfg.MaxFailures {
				now := time.Now()
				if now.Sub(appStatus.LastRebootTime) > 3*time.Minute {
					appStatus.LastRebootTime = now
					appStatus.TotalReboots++
					statusLock.Unlock()

					err := triggerRouterReboot(cfg)
					if err != nil {
						addLog("ERROR", fmt.Sprintf("Router reboot failed: %v", err))
					}
					// Cooling down while the router reboots
					time.Sleep(45 * time.Second)
					continue
				} else {
					addLog("WARN", "Reboot trigger skipped: Still in cooldown period.")
				}
			}
		}
		statusLock.Unlock()

		time.Sleep(time.Duration(cfg.CheckInterval) * time.Second)
	}
}

func enableCORS(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length")
}

func main() {
	go monitorEngine()

	http.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.ResponseWriter) {
		enableCORS(&w)
		if r.Method == "OPTIONS" {
			return
		}
		statusLock.RLock()
		defer statusLock.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(appStatus)
	})

	http.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.ResponseWriter) {
		enableCORS(&w)
		if r.Method == "OPTIONS" {
			return
		}
		logsLock.Lock()
		defer logsLock.Unlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(logStore)
	})

	http.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.ResponseWriter) {
		enableCORS(&w)
		if r.Method == "OPTIONS" {
			return
		}
		if r.Method == "GET" {
			configLock.RLock()
			defer configLock.RUnlock()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(currentCfg)
			return
		}
		if r.Method == "POST" {
			var newCfg Config
			if err := json.NewDecoder(r.Body).Decode(&newCfg); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			configLock.Lock()
			currentCfg = newCfg
			configLock.Unlock()
			addLog("INFO", "Configuration updated successfully.")
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
			return
		}
	})

	http.HandleFunc("/api/reboot", func(w http.ResponseWriter, r *http.ResponseWriter) {
		enableCORS(&w)
		if r.Method == "OPTIONS" {
			return
		}
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		configLock.RLock()
		cfg := currentCfg
		configLock.RUnlock()

		go func() {
			statusLock.Lock()
			appStatus.LastRebootTime = time.Now()
			appStatus.TotalReboots++
			statusLock.Unlock()
			_ = triggerRouterReboot(cfg)
		}()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "reboot_initiated"})
	})

	serverAddr := "0.0.0.0:8080"
	addLog("INFO", fmt.Sprintf("NetPulse Core Engine active on %s", serverAddr))
	if err := http.ListenAndServe(serverAddr, nil); err != nil {
		log.Fatalf("Fatal server shutdown: %v", err)
	}
}
