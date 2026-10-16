use crate::commands::{self, AppState};
use std::{
    sync::{atomic::Ordering, mpsc, Arc, Mutex},
    thread::JoinHandle,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

enum Signal {
    Configure(Option<Duration>),
    Stop,
}
struct Schedule {
    send: mpsc::Sender<Signal>,
    thread: Mutex<Option<JoinHandle<()>>>,
}
impl Schedule {
    fn start(
        interval: Option<Duration>,
        initial_delay: Duration,
        mut job: impl FnMut() -> bool + Send + 'static,
    ) -> Self {
        let (send, receive) = mpsc::channel();
        let thread = std::thread::Builder::new()
            .name("sonotune-scan".into())
            .spawn(move || {
                let mut interval = interval;
                let mut first = true;
                let mut deadline = Some(Instant::now() + initial_delay);
                loop {
                    let signal = match deadline {
                        Some(at) => {
                            receive.recv_timeout(at.saturating_duration_since(Instant::now()))
                        }
                        None => receive
                            .recv()
                            .map_err(|_| mpsc::RecvTimeoutError::Disconnected),
                    };
                    match signal {
                        Ok(Signal::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Ok(Signal::Configure(value)) => {
                            interval = value;
                            if !first {
                                deadline = interval.map(|delay| Instant::now() + delay);
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            if job() {
                                first = false;
                                deadline = interval.map(|delay| Instant::now() + delay);
                            } else {
                                deadline = Some(Instant::now() + Duration::from_secs(2));
                            }
                        }
                    }
                }
            })
            .expect("Could not start scan scheduler");
        Self {
            send,
            thread: Mutex::new(Some(thread)),
        }
    }
    fn stop(&self) {
        let _ = self.send.send(Signal::Stop);
        if let Ok(mut thread) = self.thread.lock() {
            if let Some(thread) = thread.take() {
                let _ = thread.join();
            }
        }
    }
}
pub fn interval(minutes: Option<u32>) -> Result<Option<Duration>, String> {
    if minutes.is_some_and(|n| n == 0 || n > 10_080) {
        return Err("Укажите целое число минут от 1 до 10080.".into());
    }
    Ok(minutes.map(|minutes| Duration::from_secs(u64::from(minutes) * 60)))
}
pub struct BackgroundScanner {
    schedule: Schedule,
    state: Arc<AppState>,
}
impl BackgroundScanner {
    pub fn start(app: AppHandle, state: Arc<AppState>) -> Self {
        let minutes = state
            .db
            .state::<Option<u32>>("scan-interval")
            .ok()
            .flatten()
            .flatten();
        let delay = interval(minutes).ok().flatten();
        let worker_state = state.clone();
        let schedule = Schedule::start(delay, Duration::from_millis(350), move || {
            if worker_state.closing.load(Ordering::Acquire) {
                return true;
            }
            if worker_state.scanning.load(Ordering::Acquire) {
                return false;
            }
            match commands::scan_folders(&worker_state, None) {
                Ok(library) => {
                    let _ = app.emit("library-updated", &library);
                }
                Err(error) if error == "Сканирование уже выполняется." => {
                    return false
                }
                Err(error) => {
                    let _ = app.emit("playback-error", error);
                }
            }
            true
        });
        Self { schedule, state }
    }
    pub fn configure(&self, minutes: Option<u32>) -> Result<(), String> {
        let delay = interval(minutes)?;
        self.state.db.save_state("scan-interval", &minutes)?;
        self.schedule
            .send
            .send(Signal::Configure(delay))
            .map_err(|e| e.to_string())
    }
    pub fn shutdown(&self) {
        self.state.closing.store(true, Ordering::Release);
        self.state.cancel.store(true, Ordering::Release);
        self.schedule.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scheduler_runs_once_then_sleeps_until_configured_and_stops_promptly() {
        let (send, receive) = mpsc::channel();
        let schedule = Schedule::start(None, Duration::from_millis(2), move || {
            let _ = send.send(());
            true
        });
        receive.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(receive.recv_timeout(Duration::from_millis(30)).is_err());
        schedule
            .send
            .send(Signal::Configure(Some(Duration::from_millis(10))))
            .unwrap();
        receive.recv_timeout(Duration::from_secs(1)).unwrap();
        schedule.send.send(Signal::Configure(None)).unwrap();
        std::thread::sleep(Duration::from_millis(15));
        while receive.try_recv().is_ok() {}
        assert!(receive.recv_timeout(Duration::from_millis(30)).is_err());
        let before = Instant::now();
        schedule.stop();
        assert!(before.elapsed() < Duration::from_secs(1));
        assert!(interval(Some(0)).is_err());
        assert!(interval(Some(10_081)).is_err());
        assert_eq!(interval(Some(7)).unwrap(), Some(Duration::from_secs(420)));
    }
}
