use std::time::{Duration, Instant};

/// One play session. Seeking changes the remaining audio, never the listened time.
pub struct ListeningSession {
    pub started: bool,
    counted: bool,
    listened: Duration,
    remaining: Option<Duration>,
    threshold: Duration,
    updated: Instant,
}
impl ListeningSession {
    pub fn new(duration: f64, now: Instant) -> Self {
        let duration = if duration.is_finite() && duration > 0.0 {
            Some(Duration::from_secs_f64(duration))
        } else {
            None
        };
        Self {
            started: false,
            counted: false,
            listened: Duration::ZERO,
            remaining: duration,
            threshold: duration
                .map(|v| v / 2)
                .unwrap_or(Duration::from_secs(30))
                .min(Duration::from_secs(30)),
            updated: now,
        }
    }
    pub fn tick(&mut self, now: Instant, playing: bool) -> bool {
        let elapsed = now.saturating_duration_since(self.updated);
        self.updated = now;
        if !playing || !self.started {
            return false;
        }
        let credit = self.remaining.map(|v| elapsed.min(v)).unwrap_or(elapsed);
        self.listened += credit;
        if let Some(remaining) = &mut self.remaining {
            *remaining = remaining.saturating_sub(credit);
        }
        if !self.counted && self.listened >= self.threshold {
            self.counted = true;
            true
        } else {
            false
        }
    }
    pub fn seek(&mut self, seconds: f64, duration: f64, now: Instant) {
        self.updated = now;
        self.remaining = if duration.is_finite() && duration > 0.0 {
            Some(Duration::from_secs_f64((duration - seconds).max(0.0)))
        } else {
            None
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pauses_seeks_and_replays_do_not_inflate_counts() {
        let now = Instant::now();
        let mut session = ListeningSession::new(180.0, now);
        session.started = true;
        assert!(!session.tick(now + Duration::from_secs(10), true));
        assert!(!session.tick(now + Duration::from_secs(110), false));
        session.seek(170.0, 180.0, now + Duration::from_secs(110));
        assert!(!session.tick(now + Duration::from_secs(120), true));
        session.seek(0.0, 180.0, now + Duration::from_secs(120));
        assert!(session.tick(now + Duration::from_secs(130), true));
        assert!(!session.tick(now + Duration::from_secs(160), true));
    }
    #[test]
    fn short_tracks_count_after_half_and_loading_paused_does_not_count() {
        let now = Instant::now();
        let mut session = ListeningSession::new(0.1, now);
        assert!(!session.tick(now + Duration::from_secs(10), false));
        session.started = true;
        assert!(session.tick(now + Duration::from_millis(10250), true));
        assert!(!session.tick(now + Duration::from_secs(11), true));
        let mut skipped = ListeningSession::new(10.0, now);
        skipped.started = true;
        skipped.seek(10.0, 10.0, now);
        assert!(!skipped.tick(now + Duration::from_secs(1), true));
    }
}
